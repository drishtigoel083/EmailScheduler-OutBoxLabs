import { Worker, Job } from 'bullmq';
import { QUEUE_NAME, redisConnection, EmailJobData, enqueueEmailJob } from '../services/queue.service.js';
import { prisma } from '../db/prisma.js';
import { sendEmailViaEthereal } from '../services/email.service.js';
import { checkAndIncrementRateLimit } from '../services/rateLimiter.service.js';
import { sendSlackRateLimitAlert } from '../services/slack.service.js';
import { indexEmailDocument } from '../services/elasticsearch.service.js';
import { config } from '../config/index.js';

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const { emailId } = job.data;
      console.log(`⚙️  [Worker] Processing Job ID: ${job.id} for Email ID: ${emailId}`);

      // 1. Fetch Email from DB
      const email = await prisma.email.findUnique({
        where: { id: emailId },
      });

      if (!email) {
        console.warn(`⚠️ [Worker] Email ID ${emailId} not found in DB. Skipping job.`);
        return;
      }

      // 2. Idempotency Check: Skip if already sent or processing succeeded
      if (email.status === 'SENT') {
        console.log(`ℹ️  [Worker] Email ID ${emailId} was already SENT. Idempotent skip.`);
        return;
      }

      // 3. Concurrency Rate Limit Check
      const rateCheck = await checkAndIncrementRateLimit(email.sender);
      if (!rateCheck.allowed) {
        console.warn(
          `⏱️ [Worker] Rate limit hit for sender: ${email.sender} (${rateCheck.currentCount}/${rateCheck.maxLimit}). Rescheduling job in ${Math.round(rateCheck.timeToNextHourMs / 1000)}s.`
        );

        // Update DB status to RESCHEDULED
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'RESCHEDULED',
            failReason: `Hourly rate limit of ${rateCheck.maxLimit} emails hit for ${email.sender}`,
          },
        });

        // Trigger Slack alert
        try {
          await sendSlackRateLimitAlert(email.userId, email.sender, rateCheck.currentCount, rateCheck.maxLimit);
        } catch (err: any) {
          console.error('Slack alert trigger error:', err?.message || err);
        }

        // Reschedule job into BullMQ for the start of the next hour window
        const nextJobId = await enqueueEmailJob(emailId, rateCheck.timeToNextHourMs);
        await prisma.email.update({
          where: { id: emailId },
          data: { bullmqJobId: nextJobId, status: 'SCHEDULED' },
        });

        return;
      }

      // 4. Mark DB status as PROCESSING
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'PROCESSING' },
      });

      try {
        // 5. Send Email via Ethereal SMTP
        const result = await sendEmailViaEthereal({
          from: email.sender,
          to: email.recipient,
          subject: email.subject,
          html: email.body,
        });

        // 6. Update DB status to SENT
        const updatedEmail = await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        console.log(`✅ [Worker] Email ID ${emailId} successfully SENT to ${email.recipient}! MessageId: ${result.messageId}`);

        // Index in Elasticsearch
        try {
          await indexEmailDocument(updatedEmail);
        } catch (esErr: any) {
          console.error('Elasticsearch indexing failed:', esErr?.message || esErr);
        }
      } catch (sendError: any) {
        console.error(`❌ [Worker] Failed to send email ID ${emailId}:`, sendError.message);

        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            failReason: sendError.message,
          },
        });

        throw sendError; // BullMQ retries job according to backoff strategy
      }
    },
    {
      connection: redisConnection,
      concurrency: config.scheduling.workerConcurrency,
      // Enforces a minimum delay between individual email sends across the whole worker,
      // mimicking real SMTP provider throttling. Configurable via MIN_DELAY_MS_BETWEEN_SENDS.
      // BullMQ guarantees at most 1 job completes per `duration` ms, regardless of concurrency.
      limiter: {
        max: 1,
        duration: config.scheduling.minDelayMsBetweenSends,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`🎉 [Worker] Job ${job.id} completed successfully.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`💥 [Worker] Job ${job?.id} failed with error: ${err.message}`);
  });

  console.log(
    `🚀 [Worker] Email Worker started with concurrency = ${config.scheduling.workerConcurrency}, min delay between sends = ${config.scheduling.minDelayMsBetweenSends}ms`
  );
  return worker;
}