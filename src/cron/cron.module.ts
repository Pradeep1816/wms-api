import { PricingModule } from '../pricing/pricing.module';
import { LowStockEmailCronService } from './services/low-stock-email-cron.service';
import { LowStockEmailController } from './controllers/low-stock-email.controller';
import { Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { CacheModule } from '../cache/cache.module';
import { Course } from '../course/entities/course.entity';
import { CustomerEmailNotification } from '../customer/entities/customer-email-notification.entity';
import { NotificationEmailType } from '../customer/entities/notification-email-type.entity';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';
import { EquipmentRental } from '../equipment-rental/entities/equipment-rental.entity';
import { EquipmentRentalInstrument } from '../equipment-rental/entities/equipment-rental-instrument.entity';
import { EquipmentRentalInvoice } from '../equipment-rental/entities/equipment-rental-invoice.entity';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { Item } from '../item/entities/item.entity';
import { GroupLesson } from '../lesson/entities/group-lesson.entity';
import { GroupLessonEmailStatus } from '../lesson/entities/group-lesson-email-status.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { LessonPayment } from '../lesson/entities/lesson-payment.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { PrivateLessonEmailStatus } from '../lesson/entities/private-lesson-email-status.entity';
import { LessonModule } from '../lesson/lesson.module';
import { Location } from '../location/entities/location.entity';
import { LogActivity } from '../log/entities/log-activity.entity';
import { LogHistory } from '../log/entities/log-history.entity';
import { LogLink } from '../log/entities/log-link.entity';
import { LogObject } from '../log/entities/log-object.entity';
import { Log } from '../log/entities/log.entity';
import { EmailObject } from '../notification/entities/email-object.entity';
import { EmailTemplate } from '../notification/entities/email-template.entity';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { RoyaltyLedgerModule } from '../payment/royalty-ledger.module';
import { Program } from '../program/entities/program.entity';
import { CustomerRecurringPayment } from '../recurring-payment/entities/customer-recurring-payment.entity';
import { CustomerRecurringPaymentEnrolment } from '../recurring-payment/entities/customer-recurring-payment-enrolment.entity';
import { RecurringPayment } from '../recurring-payment/entities/recurring-payment.entity';
import { CustomerBalanceRecalculatorService } from '../shared/services/customer-balance-recalculator.service';
import { MailerService } from '../shared/services/mailer.service';
import { Student } from '../student/entities/student.entity';
import { TaxCode } from '../tax/entities/tax-code.entity';
import { TaxStatus } from '../tax/entities/tax-status.entity';
import { TaxTypeTaxStatusAssoc } from '../tax/entities/tax-type-tax-status-assoc.entity';
import { TaxType } from '../tax/entities/tax-type.entity';
import { UserContact } from '../user/entities/user-contact.entity';
import { UserEmail } from '../user/entities/user-email.entity';
import { User } from '../user/entities/user.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { CronController } from './controllers/cron.controller';
import { CustomerBalanceCronRepository } from './repositories/customer-balance-cron.repository';
import { EmailAutoEmailCronRepository } from './repositories/email-auto-email-cron.repository';
import { EnrolmentAutoRenewalCronRepository } from './repositories/enrolment-auto-renewal-cron.repository';
import { InvoiceAllCompletedLessonsCronRepository } from './repositories/invoice-all-completed-lessons-cron.repository';
import { InvoiceAllExpiredLessonsCronRepository } from './repositories/invoice-all-expired-lessons-cron.repository';
import { InvoiceEquipmentRentalsCronRepository } from './repositories/invoice-equipment-rentals-cron.repository';
import { RecurringPaymentCreateCronRepository } from './repositories/recurring-payment-create-cron.repository';
import { RecurringPaymentUpdateCronRepository } from './repositories/recurring-payment-update-cron.repository';
import { StudentStatusCronRepository } from './repositories/student-status-cron.repository';
import { CustomerBalanceCronService } from './services/customer-balance-cron.service';
import { CustomerStatusCronService } from './services/customer-status-cron.service';
import { CustomerStatusCronRepository } from './repositories/customer-status-cron.repository';
import { CronLockService } from './services/cron-lock.service';
import { EmailAutoEmailCronService } from './services/email-auto-email-cron.service';
import { EnrolmentAutoRenewalCronService } from './services/enrolment-auto-renewal-cron.service';
import { InvoiceAllCompletedLessonsCronService } from './services/invoice-all-completed-lessons-cron.service';
import { InvoiceAllExpiredLessonsCronService } from './services/invoice-all-expired-lessons-cron.service';
import { InvoiceEquipmentRentalsCronService } from './services/invoice-equipment-rentals-cron.service';
import { RecurringPaymentCreateCronService } from './services/recurring-payment-create-cron.service';
import { RecurringPaymentUpdateCronService } from './services/recurring-payment-update-cron.service';
import { StudentStatusCronService } from './services/student-status-cron.service';

@Module({
  imports: [
    NestScheduleModule.forRoot(),
    CacheModule,
    LessonModule,
    EnrolmentModule,
    RoyaltyLedgerModule,
    PricingModule,
    TypeOrmModule.forFeature([
      User,
      Student,
      NotificationEmailType,
      CustomerEmailNotification,
      RbacAuthAssignment,
      CustomerAccount,
      Location,
      UserLocation,
      UserProfile,
      UserContact,
      UserEmail,
      Enrolment,
      Course,
      Program,
      Lesson,
      PrivateLesson,
      PrivateLessonEmailStatus,
      EquipmentRental,
      EquipmentRentalInstrument,
      EquipmentRentalInvoice,
      Invoice,
      InvoiceLineItem,
      Item,
      TaxStatus,
      TaxType,
      TaxTypeTaxStatusAssoc,
      TaxCode,
      Log,
      LogLink,
      LogHistory,
      LogObject,
      LogActivity,
      GroupLesson,
      GroupLessonEmailStatus,
      LessonPayment,
      Payment,
      PaymentMethod,
      CustomerRecurringPayment,
      CustomerRecurringPaymentEnrolment,
      RecurringPayment,
      EmailObject,
      EmailTemplate,
    ]),
    AuthModule,
  ],
  controllers: [CronController, LowStockEmailController],
  providers: [
    LowStockEmailCronService,
    MailerService,
    CustomerBalanceCalculationRepository,
    CustomerBalanceRecalculatorService,
    CronLockService,
    CustomerBalanceCronRepository,
    CustomerBalanceCronService,
    CustomerStatusCronRepository,
    CustomerStatusCronService,
    EmailAutoEmailCronRepository,
    EmailAutoEmailCronService,
    EnrolmentAutoRenewalCronRepository,
    EnrolmentAutoRenewalCronService,
    InvoiceAllCompletedLessonsCronRepository,
    InvoiceAllCompletedLessonsCronService,
    InvoiceAllExpiredLessonsCronRepository,
    InvoiceAllExpiredLessonsCronService,
    InvoiceEquipmentRentalsCronRepository,
    InvoiceEquipmentRentalsCronService,
    RecurringPaymentCreateCronRepository,
    RecurringPaymentCreateCronService,
    RecurringPaymentUpdateCronRepository,
    RecurringPaymentUpdateCronService,
    StudentStatusCronRepository,
    StudentStatusCronService,
  ],
  exports: [
    CustomerBalanceCronService,
    CustomerStatusCronService,
    EmailAutoEmailCronService,
    EnrolmentAutoRenewalCronService,
    InvoiceAllCompletedLessonsCronService,
    InvoiceAllExpiredLessonsCronService,
    InvoiceEquipmentRentalsCronService,
    RecurringPaymentCreateCronService,
    RecurringPaymentUpdateCronService,
    StudentStatusCronService,
  ],
})
export class CronModule {}
