import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config/index.js';

export interface EmailJobData {
  emailId: string;
}

export const QUEUE_NAME = 'email-queue';

// Create ONE persistent Redis connection for BullMQ
export const redisConnection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,

  retryStrategy(times) {
    return Math.min(times * 1000, 5000);
  },
});

redisConnection.on('connect', () => {
  console.log('✅ [Redis] Connected');
});

redisConnection.on('ready', () => {
  console.log('✅ [Redis] Ready');
});

redisConnection.on('error', (err) => {
  console.error('❌ [Redis] Error:', err.message);
});

redisConnection.on('close', () => {
  console.warn('⚠️ [Redis] Connection closed');
});

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
  connection: redisConnection,

  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,

    attempts: 3,

    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

/**
 * Enqueue a delayed email job by Email ID
 */
export async function enqueueEmailJob(
  emailId: string,
  delayMs: number,
  overrideJobId?: string
): Promise<string> {
  const jobId =
    overrideJobId || `email-${emailId}-${Date.now()}`;

  const job = await emailQueue.add(
    'send-email',
    { emailId },
    {
      delay: Math.max(0, Math.floor(delayMs)),
      jobId,
    }
  );

  return job.id || jobId;
}