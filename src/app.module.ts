import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { SharedModule } from './shared/shared.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { LocationModule } from './location/location.module';
import { EnrolmentModule } from './enrolment/enrolment.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { CourseModule } from './course/course.module';
import { ProgramModule } from './program/program.module';
import { PricingModule } from './pricing/pricing.module';
import { LessonModule } from './lesson/lesson.module';
import { InvoiceModule } from './invoice/invoice.module';
import { ItemModule } from './item/item.module';
import { TeacherModule } from './teacher/teacher.module';
import { HolidayModule } from './holiday/holiday.module';
import { ScheduleModule } from './schedule/schedule.module';
import { EquipmentRentalModule } from './equipment-rental/equipment-rental.module';
import { ReportModule } from './report/report.module';
import { CustomerModule } from './customer/customer.module';
import { StudentModule } from './student/student.module';
import { ReferralSourceModule } from './referral-source/referral-source.module';
import { CommentModule } from './comment/comment.module';
import { LogModule } from './log/log.module';
import { BlogModule } from './blog/blog.module';
import { ReleaseNotesModule } from './release-notes/release-notes.module';
import { NotificationModule } from './notification/notification.module';
import { CacheModule } from './cache/cache.module';
import { REDIS_CLIENT } from './cache/cache.constants';
import { PosModule } from './pos/pos.module';
import { CronModule } from './cron/cron.module';
import { DigitalEnrollmentModule } from './digital-enrollment/digital-enrollment.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import {
  AUTH_RATE_LIMITS,
  LOGIN_THROTTLER,
  PASSWORD_RESET_THROTTLER,
} from './rate-limit/auth-rate-limit.constants';
import { getAuthIdentityTracker } from './rate-limit/auth-identity.tracker';
import { RedisThrottlerStorage } from './rate-limit/redis-throttler.storage';
import { ExaminationModule } from './examination/examination.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    SharedModule,
    CacheModule,
    ThrottlerModule.forRootAsync({
      imports: [CacheModule],
      inject: [REDIS_CLIENT, ConfigService],
      useFactory: (redis: Redis, configService: ConfigService) => ({
        storage: new RedisThrottlerStorage(
          redis,
          `${configService.get<string>('redis.prefix') ?? 'smw-api'}:rate-limit`,
        ),
        errorMessage: 'Too many requests. Please try again later.',
        throttlers: [
          {
            name: LOGIN_THROTTLER,
            ...AUTH_RATE_LIMITS.login,
            getTracker: getAuthIdentityTracker,
          },
          {
            name: PASSWORD_RESET_THROTTLER,
            ...AUTH_RATE_LIMITS.passwordReset,
            getTracker: getAuthIdentityTracker,
          },
        ],
      }),
    }),
    HealthModule,
    UserModule,
    AuthModule,
    LocationModule,
    EnrolmentModule,
    DashboardModule,
    CourseModule,
    ProgramModule,
    LessonModule,
    InvoiceModule,
    ItemModule,
    TeacherModule,
    HolidayModule,
    ScheduleModule,
    EquipmentRentalModule,
    ReportModule,
    CustomerModule,
    StudentModule,
    ReferralSourceModule,
    CommentModule,
    LogModule,
    BlogModule,
    ReleaseNotesModule,
    NotificationModule,
    PosModule,
    CronModule,
    DigitalEnrollmentModule,
    PricingModule,
    ExaminationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
