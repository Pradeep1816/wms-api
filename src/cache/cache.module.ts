import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './cache.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisClient');
        let retryCount = 0;
        const maxRetries = 3;

        const redis = new Redis({
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          username: configService.get<string>('redis.username') || undefined,
          password: configService.get<string>('redis.password') || undefined,
          enableReadyCheck: false,
          lazyConnect: true,
          retryStrategy: (times: number) => {
            if (retryCount < maxRetries) {
              retryCount++;
              const delay = Math.min(times * 1000, 3000); // Max 3 seconds delay
              logger.warn(
                `Redis reconnection attempt ${retryCount}/${maxRetries} in ${delay}ms...`,
              );
              return delay;
            }
            logger.error(
              `Redis connection failed after ${maxRetries} attempts. Cache will be disabled.`,
            );
            return null; // Stop retrying after max attempts
          },
        });

        redis.on('error', (error) => {
          logger.warn(
            `Redis connection error: ${error.message}. Cache will be disabled.`,
          );
        });

        redis.on('connect', () => {
          logger.log('Redis connected successfully');
          retryCount = 0; // Reset counter on successful connection
        });

        return redis;
      },
    },
    CacheService,
  ],
  exports: [CacheService, REDIS_CLIENT],
})
export class CacheModule {}
