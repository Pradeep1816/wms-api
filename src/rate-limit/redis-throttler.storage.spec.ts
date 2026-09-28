import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('maps the atomic Redis result to the NestJS storage contract', async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue([4, 60, 0, 0]),
    };
    const storage = new RedisThrottlerStorage(
      redis as unknown as Redis,
      'test:rate-limit',
    );

    const result = await storage.increment(
      'hashed-key',
      60_000,
      5,
      60_000,
      'login',
    );

    expect(result).toEqual({
      totalHits: 4,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'test:rate-limit:hashed-key',
      60_000,
      5,
      60_000,
    );
  });

  it('falls back to process memory when Redis is unavailable', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('connection unavailable')),
    };
    const storage = new RedisThrottlerStorage(
      redis as unknown as Redis,
      'test:rate-limit',
    );

    const first = await storage.increment(
      'hashed-key',
      60_000,
      1,
      60_000,
      'login',
    );
    const second = await storage.increment(
      'hashed-key',
      60_000,
      1,
      60_000,
      'login',
    );

    expect(first.isBlocked).toBe(false);
    expect(second.isBlocked).toBe(true);
  });
});
