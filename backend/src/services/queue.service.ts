import { Queue } from 'bullmq';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import { config } from '../config/index.js';

export interface EmailJobData {
  emailId: string;
}

export const QUEUE_NAME = 'email-queue';

let connectionInstance: any;

try {
  connectionInstance = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 2) {
        console.warn('⚠️ [Redis] Could not connect to standalone Redis/Docker. Falling back to in-memory Redis instance...');
        return null; // Stop retrying Redis
      }
      return 500;
    },
  });

  connectionInstance.on('error', (err: any) => {
    // Suppress connection spam
  });
} catch (e) {
  console.warn('⚠️ [Redis] Using in-memory Redis mock.');
  connectionInstance = new RedisMock();
}

export const redisConnection = connectionInstance;

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
  const jobId = overrideJobId || `email-${emailId}-${Date.now()}`;
  
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
