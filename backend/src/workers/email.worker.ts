import { Worker, Job, DelayedError } from 'bullmq';

import {
  QUEUE_NAME,
  redisConnection,
  EmailJobData,
} from '../services/queue.service.js';

import { prisma } from '../db/prisma.js';

import { sendEmailViaEthereal } from '../services/email.service.js';

import {
  checkAndIncrementRateLimit,
  getRescheduleSequence,
  computeStaggeredDelay,
  shouldSendSlackRateLimitAlert,
} from '../services/rateLimiter.service.js';

import { sendSlackRateLimitAlert } from '../services/slack.service.js';

import { indexEmailDocument } from '../services/elasticsearch.service.js';

import { config } from '../config/index.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAME,

    async (job: Job<EmailJobData>, token?: string) => {
      const { emailId } = job.data;

      console.log(
        `⚙️ [Worker] Processing Job ID: ${job.id} ` +
          `for Email ID: ${emailId}`
      );

      // ---------------------------------------------------------
      // 1. Fetch email
      // ---------------------------------------------------------

      const email = await prisma.email.findUnique({
        where: { id: emailId },
      });

      if (!email) {
        console.warn(
          `⚠️ [Worker] Email ID ${emailId} not found in DB. Skipping job.`
        );

        return;
      }

      // ---------------------------------------------------------
      // 2. Idempotency protection
      // ---------------------------------------------------------

      if (email.status === 'SENT') {
        console.log(
          `ℹ️ [Worker] Email ID ${emailId} was already SENT. ` +
            `Idempotent skip.`
        );

        return;
      }

      // ---------------------------------------------------------
      // 3. Rate limit
      // ---------------------------------------------------------

      const rateCheck = await checkAndIncrementRateLimit(
        email.userId,
        email.sender
      );

      // ---------------------------------------------------------
      // 4. RATE LIMITED
      // ---------------------------------------------------------

      if (!rateCheck.allowed) {
        const limitLabel =
          rateCheck.limitType === 'global'
            ? `Global hourly rate limit of ${rateCheck.maxLimit} emails`
            : `Hourly rate limit of ${rateCheck.maxLimit} emails for ${email.sender}`;

        // Get sequential position for this sender/user/hour.
        const sequence = await getRescheduleSequence(
          email.userId,
          email.sender,
          rateCheck.nextHourTimestamp
        );

        const staggeredDelayMs = computeStaggeredDelay(
          rateCheck.timeToNextHourMs,
          sequence
        );

        const rescheduledAt = new Date(
          Date.now() + staggeredDelayMs
        );

        console.warn(
          `⏱️ [Worker] ${limitLabel} hit ` +
            `(${rateCheck.currentCount}/${rateCheck.maxLimit}). ` +
            `Rescheduling job #${sequence} in ` +
            `${Math.round(staggeredDelayMs / 1000)}s → ` +
            `${rescheduledAt.toISOString()}`
        );

        // -------------------------------------------------------
        // Update DB
        // -------------------------------------------------------

        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'RATE_LIMITED',
            failReason:
              `${limitLabel} hit. ` +
              `Rescheduled for ${rescheduledAt.toISOString()}.`,
            scheduledAt: rescheduledAt,
          },
        });

        // -------------------------------------------------------
        // Slack notification
        // -------------------------------------------------------

        const shouldAlert = await shouldSendSlackRateLimitAlert(
          email.userId,
          email.sender,
          rateCheck.nextHourTimestamp - ONE_HOUR_MS
        );

        if (shouldAlert) {
          try {
            await sendSlackRateLimitAlert(
              email.userId,
              email.sender,
              rateCheck.currentCount,
              rateCheck.maxLimit
            );
          } catch (err: unknown) {
            const message =
              err instanceof Error
                ? err.message
                : String(err);

            console.error(
              '❌ [Worker] Slack alert trigger error:',
              message
            );
          }
        }

        // -------------------------------------------------------
        // IMPORTANT:
        //
        // Move THIS SAME BullMQ job to delayed.
        //
        // DO NOT enqueue a new job.
        // -------------------------------------------------------

        if (!token) {
          throw new Error(
            'BullMQ worker token is missing; cannot move job to delayed state.'
          );
        }

        await job.moveToDelayed(
          rescheduledAt.getTime(),
          token
        );

        console.log(
          `⏳ [Worker] Job ${job.id} moved to DELAYED until ` +
            `${rescheduledAt.toISOString()}`
        );

        // Tell BullMQ that this job was deliberately delayed.
        // This prevents it from being marked COMPLETED.
        throw new DelayedError();
      }

      // ---------------------------------------------------------
      // 5. Rate limit passed
      // ---------------------------------------------------------

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'PROCESSING',
          failReason: null,
        },
      });

      try {
        // -------------------------------------------------------
        // Send email through Ethereal
        // -------------------------------------------------------

        const result = await sendEmailViaEthereal({
          from: email.sender,
          to: email.recipient,
          subject: email.subject,
          html: email.body,
        });

        // -------------------------------------------------------
        // Mark SENT
        // -------------------------------------------------------

        const updatedEmail = await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            failedAt: null,
            failReason: null,
          },
        });

        console.log(
          `✅ [Worker] Email ID ${emailId} successfully SENT ` +
            `to ${email.recipient}! ` +
            `MessageId: ${result.messageId}`
        );

        // -------------------------------------------------------
        // Elasticsearch
        // -------------------------------------------------------

        try {
          await indexEmailDocument(updatedEmail);
        } catch (esErr: unknown) {
          const message =
            esErr instanceof Error
              ? esErr.message
              : String(esErr);

          console.error(
            '⚠️ [Worker] Elasticsearch indexing failed:',
            message
          );
        }
      } catch (sendError: unknown) {
        const message =
          sendError instanceof Error
            ? sendError.message
            : String(sendError);

        console.error(
          `❌ [Worker] Failed to send email ID ${emailId}:`,
          message
        );

        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            failReason: message,
          },
        });

        // Let BullMQ handle the retry.
        throw sendError;
      }
    },

    {
      connection: redisConnection,

      // Configurable worker concurrency
      concurrency: config.scheduling.workerConcurrency,

      // Minimum delay between individual sends
      limiter: {
        max: 1,
        duration:
          config.scheduling.minDelayMsBetweenSends,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(
      `🎉 [Worker] Job ${job.id} completed successfully.`
    );
  });

  worker.on('failed', (job, err) => {
    console.error(
      `💥 [Worker] Job ${job?.id} failed with error: ${err.message}`
    );
  });

  console.log(
    `🚀 [Worker] Email Worker started — ` +
      `concurrency=${config.scheduling.workerConcurrency}, ` +
      `per-user+sender limit=` +
      `${config.scheduling.maxEmailsPerHourPerSender}/hr` +
      (
        config.scheduling.maxEmailsPerHourGlobal
          ? `, global limit=${config.scheduling.maxEmailsPerHourGlobal}/hr`
          : ''
      ) +
      `, min delay=` +
      `${config.scheduling.minDelayMsBetweenSends}ms`
  );

  return worker;
}