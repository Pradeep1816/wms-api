import { Logger } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

const INCREMENT_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local redisTime = redis.call('TIME')
local now = (tonumber(redisTime[1]) * 1000) + math.floor(tonumber(redisTime[2]) / 1000)

local values = redis.call('HMGET', key, 'hits', 'windowExpiresAt', 'blockedUntil')
local hits = tonumber(values[1]) or 0
local windowExpiresAt = tonumber(values[2]) or 0
local blockedUntil = tonumber(values[3]) or 0

if blockedUntil > now then
  local timeToExpire = math.max(0, math.ceil((windowExpiresAt - now) / 1000))
  local timeToBlockExpire = math.max(1, math.ceil((blockedUntil - now) / 1000))
  return { hits, timeToExpire, 1, timeToBlockExpire }
end

if blockedUntil > 0 then
  hits = 0
  windowExpiresAt = 0
  blockedUntil = 0
end

if windowExpiresAt <= now then
  hits = 0
  windowExpiresAt = now + ttl
end

hits = hits + 1

if hits > limit then
  blockedUntil = now + blockDuration
end

redis.call(
  'HSET',
  key,
  'hits',
  hits,
  'windowExpiresAt',
  windowExpiresAt,
  'blockedUntil',
  blockedUntil
)

local expiresAt = math.max(windowExpiresAt, blockedUntil)
redis.call('PEXPIREAT', key, expiresAt)

local timeToExpire = math.max(0, math.ceil((windowExpiresAt - now) / 1000))
local isBlocked = 0
local timeToBlockExpire = 0

if blockedUntil > now then
  isBlocked = 1
  timeToBlockExpire = math.max(1, math.ceil((blockedUntil - now) / 1000))
end

return { hits, timeToExpire, isBlocked, timeToBlockExpire }
`;

const REDIS_ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Keeps counters consistent across API replicas. If Redis is temporarily
 * unavailable, the limiter falls back to per-process memory so authentication
 * remains available with reduced, local-only protection.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallbackStorage = new ThrottlerStorageService();
  private lastRedisErrorLoggedAt = 0;

  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix: string,
  ) {}

  onApplicationShutdown(): void {
    this.fallbackStorage.onApplicationShutdown();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const result = await this.redis.eval(
        INCREMENT_SCRIPT,
        1,
        `${this.keyPrefix}:${key}`,
        ttl,
        limit,
        blockDuration,
      );

      return this.toStorageRecord(result);
    } catch (error) {
      this.logRedisError(error);
      return this.fallbackStorage.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  private toStorageRecord(result: unknown): ThrottlerStorageRecord {
    if (!Array.isArray(result) || result.length !== 4) {
      throw new Error('Redis returned an invalid throttler storage record');
    }

    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] =
      result.map(Number);

    if (
      [totalHits, timeToExpire, isBlocked, timeToBlockExpire].some(
        (value) => !Number.isFinite(value),
      )
    ) {
      throw new Error('Redis returned non-numeric throttler storage values');
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: isBlocked === 1,
      timeToBlockExpire,
    };
  }

  private logRedisError(error: unknown): void {
    const now = Date.now();
    if (now - this.lastRedisErrorLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Redis rate-limit storage failed; using in-memory fallback: ${message}`,
    );
    this.lastRedisErrorLoggedAt = now;
  }
}
