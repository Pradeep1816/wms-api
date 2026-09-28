import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrolment } from './entities/enrolment.entity';
import { Location } from '../location/entities/location.entity';
import { User } from '../user/entities/user.entity';
import { CourseSchedule } from '../course/entities/course-schedule.entity';
import { EnrolmentPaymentFrequency } from './entities/enrolment-payment-frequency.entity';
import { EnrolmentDiscount } from './entities/enrolment-discount.entity';
import { Course } from '../course/entities/course.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { LessonDiscount } from '../lesson/entities/lesson-discount.entity';
import { GroupLesson } from '../lesson/entities/group-lesson.entity';
import { GroupLessonEmailStatus } from '../lesson/entities/group-lesson-email-status.entity';
import { Student } from '../student/entities/student.entity';
import { EnrolmentService } from './services/enrolment.service';
import { EnrolmentTeacherChangeService } from './services/enrolment-teacher-change.service';
import { EnrolmentInfoService } from './services/enrolment-info.service';
import { EnrolmentScheduleService } from './services/enrolment-schedule.service';
import { EnrolmentLessonService } from './services/enrolment-lesson.service';
import { EnrolmentPaymentFrequencyService } from './services/enrolment-payment-frequency.service';
import { EnrolmentEmailService } from './services/enrolment-email.service';
import { EnrolmentRepository } from './repositories/enrolment.repository';
import { EnrolmentInfoRepository } from './repositories/enrolment-info.repository';
import { EnrolmentScheduleRepository } from './repositories/enrolment-schedule.repository';
import { EnrolmentLessonRepository } from './repositories/enrolment-lesson.repository';
import { EnrolmentPaymentFrequencyRepository } from './repositories/enrolment-payment-frequency.repository';
import { EnrolmentGainsRepository } from './repositories/enrolment-gains.repository';
import { EnrolmentLossesRepository } from './repositories/enrolment-losses.repository';
import { EnrolmentParkedRepository } from './repositories/enrolment-parked.repository';
import { EnrolmentStudentRepository } from './repositories/enrolment-student.repository';
import { EnrolmentEmailRepository } from './repositories/enrolment-email.repository';
import { EnrolmentListTransformationService } from './services/transformations/enrolment-list-transformation.service';
import { EnrolmentInfoTransformationService } from './services/transformations/enrolment-info-transformation.service';
import { EnrolmentScheduleTransformationService } from './services/transformations/enrolment-schedule-transformation.service';
import { EnrolmentLessonTransformationService } from './services/transformations/enrolment-lesson-transformation.service';
import { EnrolmentEmailTransformationService } from './services/transformations/enrolment-email-transformation.service';
import { GroupEnrolmentPrintTransformationService } from './services/transformations/group-enrolment-print-transformation.service';
import { GroupEnrolmentPrintService } from './services/group-enrolment-print.service';
import { GroupEnrolmentPrintRepository } from './repositories/group-enrolment-print.repository';
import { EnrolmentListController } from './controllers/enrolment.controller';
import { EnrolmentInfoController } from './controllers/enrolment-info.controller';
import { EnrolmentLessonController } from './controllers/enrolment-lesson.controller';
import { EnrolmentPaymentFrequencyController } from './controllers/enrolment-payment-frequency.controller';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { LogModule } from '../log/log.module';
import { PaymentFrequency } from '../payment/entities/payment-frequency.entity';
import { PaymentCycle } from '../payment/entities/payment-cycle.entity';
import { AutoRenewal } from './entities/auto-renewal.entity';
import { AutoRenewalLessons } from './entities/auto-renewal-lessons.entity';
import { AutoRenewalPaymentCycle } from './entities/auto-renewal-payment-cycle.entity';
import { CourseProgramRate } from '../course/entities/course-program-rate.entity';
import { PaymentCycleLesson } from './entities/payment-cycle-lesson.entity';
import { PrivateLessonEmailStatus } from '../lesson/entities/private-lesson-email-status.entity';
import { NotificationEmailType } from '../customer/entities/notification-email-type.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { LessonHierarchy } from '../lesson/entities/lesson-hierarchy.entity';
import { InvoiceItemLesson } from '../invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { InvoiceItemEnrolment } from '../invoice/entities/invoice-item-enrolment.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoicePayment } from '../invoice/entities/invoice-payment.entity';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { CustomerDiscount } from '../customer/entities/customer-discount.entity';
import { LessonPayment } from '../payment/entities/lesson-payment.entity';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { LessonModule } from '../lesson/lesson.module';
import { PricingModule } from '../pricing/pricing.module';
import { UserProfile } from '../user/entities/user-profile.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { Program } from '../program/entities/program.entity';
import { EmailTemplate } from '../notification/entities/email-template.entity';
import { UserEmail } from '../user/entities/user-email.entity';
import { UserContact } from '../user/entities/user-contact.entity';
import { Qualification } from '../qualification/entities/qualification.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { PermanentScheduleChangeService } from './services/permanent-schedule-change.service';
import { PermanentScheduleChangeReviewService } from './permanent-schedule-change/permanent-schedule-change-review.service';
import { PermanentScheduleChangeValidator } from './validators/permanent-schedule-change/permanent-schedule-change.validator';
import { PermanentScheduleChangeDraftService } from './permanent-schedule-change/permanent-schedule-change-draft.service';
import { PermanentScheduleChangeQueryRepository } from './repositories/permanent-schedule-change/permanent-schedule-change-query.repository';
import { PermanentScheduleChangeDraftRepository } from './repositories/permanent-schedule-change/permanent-schedule-change-draft.repository';
import { PermanentScheduleChangeReviewRepository } from './repositories/permanent-schedule-change/permanent-schedule-change-review.repository';
import { PermanentScheduleChangeController } from './controllers/permanent-schedule-change.controller';
import { PermanentScheduleChangeConfirmationService } from './permanent-schedule-change/permanent-schedule-change-confirmation.service';
import { PermanentScheduleChangeConfirmationRepository } from './repositories/permanent-schedule-change/permanent-schedule-change-confirmation.repository';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';
import { CustomerBalanceRecalculatorService } from '../shared/services/customer-balance-recalculator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Enrolment,
      Location,
      User,
      CourseSchedule,
      EnrolmentPaymentFrequency,
      EnrolmentDiscount,
      Course,
      Lesson,
      LessonDiscount,
      GroupLesson,
      GroupLessonEmailStatus,
      Student,
      PaymentFrequency,
      PaymentCycle,
      AutoRenewal,
      AutoRenewalLessons,
      AutoRenewalPaymentCycle,
      CourseProgramRate,
      PaymentCycleLesson,
      PrivateLessonEmailStatus,
      NotificationEmailType,
      PrivateLesson,
      LessonHierarchy,
      Student,
      User,
      InvoiceItemLesson,
      InvoiceLineItem,
      InvoiceItemEnrolment,
      Invoice,
      InvoicePayment,
      CustomerAccount,
      CustomerDiscount,
      LessonPayment,
      Payment,
      PaymentMethod,
      PaymentCycle,
      UserProfile,
      RbacAuthAssignment,
      Program,
      EmailTemplate,
      UserEmail,
      UserContact,
      Qualification,
      Holiday,
    ]),
    AuthModule,
    LocationModule,
    LogModule,
    LessonModule,
    // EnrolmentScheduleService resolves a rate per lesson date through
    // CourseRateResolverService, so a schedule extension that crosses
    // 1 September 2026 prices each side correctly.
    PricingModule,
  ],
  controllers: [
    EnrolmentListController,
    EnrolmentInfoController,
    PermanentScheduleChangeController,
    EnrolmentLessonController,
    EnrolmentPaymentFrequencyController,
  ],
  providers: [
    EnrolmentService,
    EnrolmentTeacherChangeService,
    EnrolmentInfoService,
    EnrolmentScheduleService,
    PermanentScheduleChangeService,
    PermanentScheduleChangeReviewService,
    PermanentScheduleChangeDraftService,
    PermanentScheduleChangeConfirmationService,
    PermanentScheduleChangeValidator,
    PermanentScheduleChangeQueryRepository,
    PermanentScheduleChangeDraftRepository,
    PermanentScheduleChangeReviewRepository,
    PermanentScheduleChangeConfirmationRepository,
    CustomerBalanceCalculationRepository,
    CustomerBalanceRecalculatorService,
    EnrolmentLessonService,
    EnrolmentPaymentFrequencyService,
    EnrolmentEmailService,
    GroupEnrolmentPrintService,
    EnrolmentRepository,
    EnrolmentInfoRepository,
    EnrolmentScheduleRepository,
    EnrolmentLessonRepository,
    EnrolmentPaymentFrequencyRepository,
    EnrolmentGainsRepository,
    EnrolmentLossesRepository,
    EnrolmentParkedRepository,
    EnrolmentStudentRepository,
    EnrolmentEmailRepository,
    GroupEnrolmentPrintRepository,
    EnrolmentListTransformationService,
    EnrolmentInfoTransformationService,
    EnrolmentScheduleTransformationService,
    EnrolmentLessonTransformationService,
    EnrolmentEmailTransformationService,
    GroupEnrolmentPrintTransformationService,
  ],
  exports: [
    EnrolmentService,
    EnrolmentInfoService,
    EnrolmentScheduleService,
    EnrolmentLessonService,
    EnrolmentPaymentFrequencyService,
    EnrolmentEmailService,
    GroupEnrolmentPrintService,
    EnrolmentRepository,
    EnrolmentInfoRepository,
    EnrolmentScheduleRepository,
    EnrolmentLessonRepository,
    EnrolmentPaymentFrequencyRepository,
    EnrolmentGainsRepository,
    EnrolmentLossesRepository,
    EnrolmentParkedRepository,
    EnrolmentStudentRepository,
    EnrolmentEmailRepository,
    GroupEnrolmentPrintRepository,
    EnrolmentListTransformationService,
    EnrolmentInfoTransformationService,
    EnrolmentScheduleTransformationService,
    EnrolmentLessonTransformationService,
    EnrolmentEmailTransformationService,
    GroupEnrolmentPrintTransformationService,
  ],
})
export class EnrolmentModule {}
