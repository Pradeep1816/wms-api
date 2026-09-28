import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix: string;
  private readonly defaultTtl: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.defaultTtl = this.configService.get<number>('redis.ttl') ?? 300;
    this.prefix = this.configService.get<string>('redis.prefix') ?? 'smw-api';
  }

  async get<T>(key: string): Promise<T | null> {
    const namespacedKey = this.namespaced(key);

    try {
      const raw = await this.redis.get(namespacedKey);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`Failed to read cache key ${namespacedKey}: ${error.message}`);
      await this.safeForget(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const namespacedKey = this.namespaced(key);

    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      const payload = JSON.stringify(value);

      if (ttl > 0) {
        await this.redis.set(namespacedKey, payload, 'EX', ttl);
      } else {
        await this.redis.set(namespacedKey, payload);
      }
    } catch (error) {
      this.logger.warn(`Failed to set cache key ${namespacedKey}: ${error.message}`);
    }
  }

  async forget(key: string): Promise<void> {
    try {
      await this.redis.del(this.namespaced(key));
    } catch (error) {
      this.logger.warn(`Failed to delete cache key ${key}: ${error.message}`);
    }
  }

  async remember<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    try {
      await this.set(key, value, ttlSeconds);
    } catch (error) {
      this.logger.warn(`Failed to cache key ${key}: ${error.message}`);
    }
    return value;
  }

  getDefaultTtl(): number {
    return this.defaultTtl;
  }

  private namespaced(key: string): string {
    return `${this.prefix}:${key}`;
  }

  private async safeForget(key: string): Promise<void> {
    try {
      await this.redis.del(this.namespaced(key));
    } catch (error) {
      this.logger.warn(`Failed to clean corrupt cache key ${key}: ${error.message}`);
    }
  }
}

