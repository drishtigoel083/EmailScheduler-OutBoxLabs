import { prisma } from '../db/prisma.js';
import { emailQueue, enqueueEmailJob } from './queue.service.js';

/**
 * Boot Reconciliation Service
 * Ensures PostgreSQL database remains the single source of truth for email scheduling state.
 * Scans DB for 'SCHEDULED' emails on startup and re-enqueues any jobs missing from Redis.
 */
export async function reconcileJobsOnBoot(): Promise<void> {
  console.log('🔄 [Reconciliation] Starting boot reconciliation scan for scheduled emails...');

  try {
    const scheduledEmails = await prisma.email.findMany({
      where: {
        status: 'SCHEDULED',
      },
    });

    if (scheduledEmails.length === 0) {
      console.log('✅ [Reconciliation] Zero scheduled emails found in DB needing reconciliation.');
      return;
    }

    console.log(`📋 [Reconciliation] Found ${scheduledEmails.length} SCHEDULED emails in DB. Verifying BullMQ queue state...`);

    let reconciledCount = 0;

    for (const email of scheduledEmails) {
      let jobExists = false;

      if (email.bullmqJobId) {
        const existingJob = await emailQueue.getJob(email.bullmqJobId);
        if (existingJob) {
          const state = await existingJob.getState();
          if (state === 'delayed' || state === 'waiting' || state === 'active') {
            jobExists = true;
          }
        }
      }

      if (!jobExists) {
        const now = Date.now();
        const scheduledTime = new Date(email.scheduledAt).getTime();
        const delayMs = Math.max(0, scheduledTime - now);

        console.log(
          `⚠️ [Reconciliation] Email ID ${email.id} (Scheduled for ${email.scheduledAt.toISOString()}) missing in Redis. Re-enqueueing with delay: ${delayMs}ms.`
        );

        const newJobId = await enqueueEmailJob(email.id, delayMs);
        
        await prisma.email.update({
          where: { id: email.id },
          data: { bullmqJobId: newJobId },
        });

        reconciledCount++;
      }
    }

    console.log(`🎉 [Reconciliation] Complete. Reconciled and re-enqueued ${reconciledCount} missing jobs in BullMQ.`);
  } catch (error: any) {
    console.error('❌ [Reconciliation] Failed during boot reconciliation:', error.message);
  }
}
