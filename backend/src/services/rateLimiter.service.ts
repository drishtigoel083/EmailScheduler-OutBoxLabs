import { redisConnection } from './queue.service.js';
import { config } from '../config/index.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  maxLimit: number;
  timeToNextHourMs: number;
}

/**
 * Atomic Redis rate limiter using sliding/fixed hourly windows keyed by sender.
 * Uses atomic Lua script execution to guarantee thread/concurrency safety across multiple workers.
 */
export async function checkAndIncrementRateLimit(
  sender: string,
  maxLimit: number = config.scheduling.maxEmailsPerHour
): Promise<RateLimitCheckResult> {
  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;
  
  const currentHourTimestamp = Math.floor(now / ONE_HOUR_MS) * ONE_HOUR_MS;
  const nextHourTimestamp = currentHourTimestamp + ONE_HOUR_MS;
  const timeToNextHourMs = nextHourTimestamp - now + 1000; // 1s safety margin

  const key = `rate_limit:${sender.toLowerCase()}:${currentHourTimestamp}`;

  // Atomic Lua Script: Increment and set expiration if key is newly created
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], 7200)
    end
    return current
  `;

  try {
    const currentCount = (await redisConnection.eval(
      luaScript,
      1,
      key
    )) as number;

    if (currentCount > maxLimit) {
      // Over limit - decrement back so we don't pollute counter for blocked requests
      await redisConnection.decr(key);
      return {
        allowed: false,
        currentCount: currentCount - 1,
        maxLimit,
        timeToNextHourMs,
      };
    }

    return {
      allowed: true,
      currentCount,
      maxLimit,
      timeToNextHourMs,
    };
  } catch (error) {
    console.error('⚠️ Redis rate limiter error, allowing send as fallback:', error);
    return {
      allowed: true,
      currentCount: 1,
      maxLimit,
      timeToNextHourMs,
    };
  }
}
