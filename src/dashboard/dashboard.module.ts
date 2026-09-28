import { Module } from '@nestjs/common';
import { DashboardService } from './services/dashboard.service';
import { DashboardController } from './controllers/dashboard.controller';
import { AuthModule } from '../auth/auth.module';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { LessonModule } from '../lesson/lesson.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { ReportModule } from '../report/report.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    AuthModule,
    EnrolmentModule,
    LessonModule,
    InvoiceModule,
    ReportModule,
    SharedModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
