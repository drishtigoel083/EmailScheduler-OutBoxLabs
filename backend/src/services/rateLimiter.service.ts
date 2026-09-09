import { redisConnection } from './queue.service.js';
import { config } from '../config/index.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  maxLimit: number;
  limitType: 'sender' | 'global';
  timeToNextHourMs: number;
  nextHourTimestamp: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const GLOBAL_SENDER_KEY = '__global__';

function getHourWindow(now = Date.now()) {
  const currentHourTimestamp =
    Math.floor(now / ONE_HOUR_MS) * ONE_HOUR_MS;

  const nextHourTimestamp =
    currentHourTimestamp + ONE_HOUR_MS;

  const timeToNextHourMs =
    nextHourTimestamp - now + 1000;

  return {
    currentHourTimestamp,
    nextHourTimestamp,
    timeToNextHourMs,
  };
}

/**
 * Build a Redis key.
 *
 * Sender limit:
 *   rate_limit:<userId>:<sender>:<hour>
 *
 * This means two different application users using the same sender
 * get independent hourly limits.
 *
 * Global limit:
 *   rate_limit:__global__:<hour>
 */
function buildRateLimitKey(
  scope: 'sender' | 'global',
  userId: string,
  sender: string,
  hourTimestamp: number
): string {
  if (scope === 'global') {
    return `rate_limit:${GLOBAL_SENDER_KEY}:${hourTimestamp}`;
  }

  return `rate_limit:${userId}:${sender.toLowerCase()}:${hourTimestamp}`;
}

/**
 * Atomically increment a Redis counter and enforce a maximum.
 *
 * If the increment would exceed the limit, the increment is rolled back.
 */
async function atomicIncrementWithLimit(
  key: string,
  maxLimit: number
): Promise<{ allowed: boolean; currentCount: number }> {
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])

    if current == 1 then
      redis.call('EXPIRE', KEYS[1], 7200)
    end

    if current > tonumber(ARGV[1]) then
      redis.call('DECR', KEYS[1])
      return {0, current - 1}
    end

    return {1, current}
  `;

  const result = (await redisConnection.eval(
    luaScript,
    1,
    key,
    maxLimit
  )) as [number, number];

  return {
    allowed: result[0] === 1,
    currentCount: Number(result[1]),
  };
}

/**
 * Check and increment the hourly rate limit for a specific user + sender.
 *
 * This is intentionally scoped by userId so one user's emails do not
 * consume another user's rate limit.
 */
export async function checkAndIncrementRateLimit(
  userId: string,
  sender: string
): Promise<RateLimitCheckResult> {
  const {
    currentHourTimestamp,
    nextHourTimestamp,
    timeToNextHourMs,
  } = getHourWindow();

  const perSenderLimit =
    config.scheduling.maxEmailsPerHourPerSender;

  const globalLimit =
    config.scheduling.maxEmailsPerHourGlobal;

  const senderKey = buildRateLimitKey(
    'sender',
    userId,
    sender,
    currentHourTimestamp
  );

  try {
    /*
     * 1. Per-user + sender hourly limit
     */
    const senderCheck = await atomicIncrementWithLimit(
      senderKey,
      perSenderLimit
    );

    if (!senderCheck.allowed) {
      return {
        allowed: false,
        currentCount: senderCheck.currentCount,
        maxLimit: perSenderLimit,
        limitType: 'sender',
        timeToNextHourMs,
        nextHourTimestamp,
      };
    }

    /*
     * 2. Optional global hourly limit.
     *
     * This remains application-wide.
     */
    if (globalLimit !== null) {
      const globalKey = buildRateLimitKey(
        'global',
        userId,
        sender,
        currentHourTimestamp
      );

      const globalCheck = await atomicIncrementWithLimit(
        globalKey,
        globalLimit
      );

      if (!globalCheck.allowed) {
        /*
         * We already incremented the sender counter.
         * Roll that back because this email is not being sent.
         */
        await redisConnection.decr(senderKey);

        return {
          allowed: false,
          currentCount: globalCheck.currentCount,
          maxLimit: globalLimit,
          limitType: 'global',
          timeToNextHourMs,
          nextHourTimestamp,
        };
      }
    }

    console.log(
      `✅ [RateLimiter] ${userId} / ${sender}: ` +
        `${senderCheck.currentCount}/${perSenderLimit} emails this hour`
    );

    return {
      allowed: true,
      currentCount: senderCheck.currentCount,
      maxLimit: perSenderLimit,
      limitType: 'sender',
      timeToNextHourMs,
      nextHourTimestamp,
    };
  } catch (error) {
    /*
     * If Redis is unavailable, the queue itself is also dependent on Redis.
     * Keep the existing fail-open behavior so the worker does not crash.
     */
    console.error(
      '⚠️ [RateLimiter] Redis error, allowing email as fallback:',
      error
    );

    return {
      allowed: true,
      currentCount: 1,
      maxLimit: perSenderLimit,
      limitType: 'sender',
      timeToNextHourMs,
      nextHourTimestamp,
    };
  }
}

/**
 * Give rate-limited jobs a sequential number for the next hour.
 *
 * Scoped by user + sender so different users do not interfere with
 * each other's rescheduling order.
 */
export async function getRescheduleSequence(
  userId: string,
  sender: string,
  nextHourTimestamp: number
): Promise<number> {
  const key =
    `rate_limit_reschedule_seq:` +
    `${userId}:` +
    `${sender.toLowerCase()}:` +
    `${nextHourTimestamp}`;

  try {
    const sequence = await redisConnection.incr(key);

    if (sequence === 1) {
      await redisConnection.expire(key, 7200);
    }

    return sequence;
  } catch (error) {
    console.error(
      '⚠️ [RateLimiter] Failed to get reschedule sequence:',
      error
    );

    return 1;
  }
}

/**
 * Compute staggered delay for a rate-limited job.
 *
 * First job:
 *   next hour + 0 seconds
 *
 * Second job:
 *   next hour + minDelay
 *
 * Third job:
 *   next hour + 2 * minDelay
 */
export function computeStaggeredDelay(
  timeToNextHourMs: number,
  sequence: number,
  minDelayMs: number =
    config.scheduling.minDelayMsBetweenSends
): number {
  return (
    timeToNextHourMs +
    Math.max(0, sequence - 1) * minDelayMs
  );
}

/**
 * Deduplicate Slack rate-limit alerts.
 *
 * One alert per user + sender + hour.
 */
export async function shouldSendSlackRateLimitAlert(
  userId: string,
  sender: string,
  hourTimestamp: number
): Promise<boolean> {
  const key =
    `slack_alert_sent:` +
    `${userId}:` +
    `${sender.toLowerCase()}:` +
    `${hourTimestamp}`;

  try {
    const result = await redisConnection.set(
      key,
      '1',
      'EX',
      7200,
      'NX'
    );

    return result === 'OK';
  } catch (error) {
    console.error(
      '⚠️ [RateLimiter] Could not deduplicate Slack alert:',
      error
    );

    // Preserve fail-open behavior for Slack notification.
    return true;
  }
}

export function getRateLimitConfig() {
  return {
    maxEmailsPerHourPerSender:
      config.scheduling.maxEmailsPerHourPerSender,

    maxEmailsPerHourGlobal:
      config.scheduling.maxEmailsPerHourGlobal,

    minDelayMsBetweenSends:
      config.scheduling.minDelayMsBetweenSends,

    workerConcurrency:
      config.scheduling.workerConcurrency,
  };
}