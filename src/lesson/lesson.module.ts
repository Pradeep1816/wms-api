import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lesson } from './entities/lesson.entity';
import { PrivateLesson } from './entities/private-lesson.entity';
import { GroupLesson } from './entities/group-lesson.entity';
import { Location } from '../location/entities/location.entity';
import { LocationAvailability } from '../location/entities/location-availability.entity';
import { User } from '../user/entities/user.entity';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { Classroom } from '../classroom/entities/classroom.entity';
import { EquipmentRentalModule } from '../equipment-rental/equipment-rental.module';
import { PrivateLessonService } from './services/private-lesson.service';
import { GroupLessonService } from './services/group-lesson.service';
import { GroupLessonDueService } from './services/group-lesson-due.service';
import { GroupLessonDueTransformationService } from './services/transformation/group-lesson-due-transformation.service';
import { GroupLessonDueCalculationService } from './services/calculation/group-lesson-due-calculation.service';
import { PrivateLessonDueService } from './services/private-lesson-due.service';
import { PrivateLessonDueTransformationService } from './services/transformation/private-lesson-due-transformation.service';
import { PrivateLessonDueCalculationService } from './services/calculation/private-lesson-due-calculation.service';
import { PrivateLessonRepository } from './repositories/private-lesson.repository';
import { GroupLessonRepository } from './repositories/group-lesson.repository';
import { GroupLessonDueRepository } from './repositories/group-lesson-due.repository';
import { PrivateLessonDueRepository } from './repositories/private-lesson-due.repository';
import { PrepaidLessonRepository } from './repositories/prepaid-lesson.repository';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { AuthModule } from '../auth/auth.module';
import { ReceivePaymentGroupLessonService } from './services/receive-payment-group-lesson.service';
import { ReceivePaymentGroupLessonTransformationService } from './services/transformation/receive-payment-group-lesson-transformation.service';
import { ReceivePaymentLessonService } from './services/receive-payment-lesson.service';
import { ReceivePaymentLessonTransformationService } from './services/transformation/receive-payment-lesson-transformation.service';
import { InvoiceModule } from '../invoice/invoice.module';
import { PricingModule } from '../pricing/pricing.module';
import { LessonInstructionHoursRepository } from './repositories/lesson-instruction-hours.repository';
import { PrepaidLessonService } from './services/prepaid-lesson.service';
import { PrepaidLessonTransformationService } from './services/transformation/prepaid-lesson-transformation.service';
import { LessonService } from './services/lesson.service';
import { LessonController } from './controllers/lesson.controller';
import { ValidateEditScheduleController } from './controllers/validate-edit-schedule.controller';
import { ExtraLessonController } from './controllers/extra-lesson.controller';
import { CourseLessonController } from './controllers/course-lesson.controller';
import { PrivateLessonListController } from './controllers/private-lesson-list.controller';
import { PrivateLessonListService } from './services/private-lesson-list.service';
import { PrivateLessonListRepository } from './repositories/private-lesson-list.repository';
import { PrivateLessonListTransformationService } from './services/transformation/private-lesson-list-transformation.service';
import { UnscheduledLessonListController } from './controllers/unscheduled-lesson-list.controller';
import { UnscheduledLessonListService } from './services/unscheduled-lesson-list.service';
import { UnscheduledLessonListRepository } from './repositories/unscheduled-lesson-list.repository';
import { UnscheduledLessonListTransformationService } from './services/transformation/unscheduled-lesson-list-transformation.service';
import { LessonDetailController } from './controllers/lesson-detail.controller';
import { UserScheduleLessonController } from './controllers/user-lesson-schedule.controller';
import { GroupLessonInvoiceController } from './controllers/group-lesson-invoice.controller';
import { LessonDetailService } from './services/lesson-detail.service';
import { GroupLessonInvoiceService } from './services/group-lesson-invoice.service';
import { LessonDetailRepository } from './repositories/lesson-detail.repository';
import { GroupLessonInvoiceRepository } from './repositories/group-lesson-invoice.repository';
import { LessonScheduleRepository } from './repositories/lesson-schedule.repository';
import { LocationModule } from '../location/location.module';
import { LessonRepository } from './repositories/lesson.repository';
import { LessonTransformationService } from './services/transformation/lesson-transformation.service';
import { LessonScheduleTransformationService } from './services/transformation/lesson-schedule-transformation.service';
import { AbsentLessonRepository } from './repositories/absent-lesson.repository';
import { UnscheduledLessonRepository } from './repositories/unscheduled-lesson.repository';
import { CourseLessonRepository } from './repositories/course-lesson.repository';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { Course } from '../course/entities/course.entity';
import { CourseExtra } from '../course/entities/course-extra.entity';
import { LessonValidationService } from './services/lesson-validation.service';
import { ValidateEditScheduleService } from './services/validate-edit-schedule.service';
import { ValidateEditScheduleRepository } from './repositories/validate-edit-schedule.repository';
import { TeacherOverlapValidator } from './validators/teacher-overlap.validator';
import { TeacherEligibilityValidator } from './validators/teacher-eligibility.validator';
import { StudentOverlapValidator } from './validators/student-overlap.validator';
import { TeacherQualificationRepository } from '../qualification/repositories/teacher-qualification.repository';
import { PrivateLessonCreateService } from './services/private-lesson-create.service';
import { ExtraLessonRateService } from './services/extra-lesson-rate.service';
import { LessonChangeService } from './services/lesson-change.service';
import { LessonReviewService } from './services/lesson-review.service';
import { LessonConfirmationService } from './services/lesson-confirmation.service';
import { LessonTeacherChangeService } from './services/lesson-teacher-change.service';
import { LessonTeacherChangeRepository } from './repositories/lesson-teacher-change.repository';
import { PrivateLessonEmailStatus } from './entities/private-lesson-email-status.entity';
import { Student } from '../student/entities/student.entity';
import { CourseProgramRate } from '../course/entities/course-program-rate.entity';
import { LessonHierarchy } from './entities/lesson-hierarchy.entity';
import { CourseSchedule } from '../course/entities/course-schedule.entity';
import { Qualification } from '../qualification/entities/qualification.entity';
import { Program } from '../program/entities/program.entity';
import { Payment } from '../payment/entities/payment.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { LessonDiscount } from './entities/lesson-discount.entity';
import { LessonPayment } from './entities/lesson-payment.entity';
import { CustomerDiscount } from '../customer/entities/customer-discount.entity';
import { EnrolmentDiscount } from '../enrolment/entities/enrolment-discount.entity';
import { PaymentCycle } from '../payment/entities/payment-cycle.entity';
import { EnrolmentPaymentFrequency } from '../enrolment/entities/enrolment-payment-frequency.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { LogModule } from '../log/log.module';
import { CalendarEventColor } from '../color-code/entities/calendar-event-color.entity';
import { LocationRepository } from '../location/repositories/location.repository';
import { MailerService } from '../shared/services/mailer.service';
import { EmailQueueService } from '../shared/services/email-queue.service';
import { BulkRescheduleLesson } from './entities/bulk-reschedule-lesson.entity';
import { PaymentCycleLesson } from '../enrolment/entities/payment-cycle-lesson.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { EmailTemplate } from '../notification/entities/email-template.entity';
import { EmailObject } from '../notification/entities/email-object.entity';
import { UserEmail } from '../user/entities/user-email.entity';
import { UserContact } from '../user/entities/user-contact.entity';
import { LessonEmailStatementController } from './controllers/lesson-email-statement.controller';
import { LessonEmailStatementService } from './services/lesson-email-statement.service';
import { LessonEmailStatementRepository } from './repositories/lesson-email-statement.repository';
import { LessonEmailStatementTransformationService } from './services/transformation/lesson-email-statement-transformation.service';
import { LessonPaymentRepository } from './repositories/lesson-payment.repository';
import { LessonPaymentTransformationService } from './services/transformation/lesson-payment-transformation.service';
import { LessonPaymentService } from './services/lesson-payment.service';
import { LessonPaymentController } from './controllers/lesson-payment.controller';
import { EditClassroomRepository } from './repositories/private-lesson-actions/edit-classroom.repository';
import { EditClassroomService } from './services/private-lesson-actions/edit-classroom.service';
import { PrivateLessonEditClassroomController } from './controllers/edit-classroom.controller';
import { EditDurationRepository } from './repositories/private-lesson-actions/edit-duration.repository';
import { EditDurationService } from './services/private-lesson-actions/edit-duration.service';
import { EditDiscountRepository } from './repositories/private-lesson-actions/edit-discount.repository';
import { EditDiscountService } from './services/private-lesson-actions/edit-discount.service';
import { PrivateLessonDeleteRepository } from './repositories/private-lesson-actions/private-lesson-delete.repository';
import { PrivateLessonDeleteService } from './services/private-lesson-actions/private-lesson-delete.service';
import { PrivateLessonEditDurationController } from './controllers/edit-duration.controller';
import { PrivateLessonEditDiscountController } from './controllers/edit-discount.controller';
import { PrivateLessonDeleteController } from './controllers/private-lesson-delete.controller';
import { LessonAttendanceController } from './controllers/lesson-attendance.controller';
import { LessonAttendanceService } from './services/lesson-attendance.service';
import { LessonAttendanceRepository } from './repositories/lesson-attendance.repository';
import { GenerateInvoiceController } from './controllers/generate-invoice.controller';
import { PrivateLessonInvoiceService } from './services/generate-invoice.service';
import { PrivateLessonInvoiceRepository } from './repositories/generate-invoice.repository';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { InvoiceItemLesson } from '../invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItemDiscount } from '../invoice/entities/invoice-line-item-discount.entity';
import { InvoicePayment } from '../invoice/entities/invoice-payment.entity';
import { CreditUsage } from '../payment/entities/credit-usage.entity';
import { Item } from '../item/entities/item.entity';
import { LessonSplitUsage } from './entities/lesson-split-usage.entity';
import { ReasonsToUnschedule } from './entities/reasons-to-unschedule.entity';
import { Note } from '../comment/entities/notes.entity';
import { LessonUnscheduleRepository } from './repositories/private-lesson-actions/lesson-unschedule.repository';
import { LessonUnscheduleService } from './services/private-lesson-actions/lesson-unschedule.service';
import { LessonUnscheduleController } from './controllers/lesson-unschedule.controller';
import { EditTaxRepository } from './repositories/edit-tax.repository';
import { EditTaxService } from './services/edit-tax.service';
import { PrivateLessonEditTaxController } from './controllers/edit-tax.controller';
import { LessonEditScheduleService } from './services/lesson-edit-schedule.service';
import { LessonEditScheduleRepository } from './repositories/lesson-edit-schedule.repository';
import { LessonEditScheduleController } from './controllers/lesson-edit-schedule.controller';
import { PrivateLessonEditOnlineTypeRepository } from './repositories/private-lesson-actions/private-lesson-edit-online-type.repository';
import { PrivateLessonEditOnlineTypeService } from './services/private-lesson-actions/private-lesson-edit-online-type.service';
import { PrivateLessonEditOnlineTypeController } from './controllers/edit-online-type.controller';
import { PrivateLessonBulkRescheduleService } from './services/private-lesson-actions/private-lesson-bulk-reschedule.service';
import { PrivateLessonBulkRescheduleController } from './controllers/private-lesson-bulk-reschedule.controller';
import { PrivateLessonBulkRescheduleRepository } from './repositories/private-lesson-actions/private-lesson-bulk-reschedule.repository';
import { EditPriceRepository } from './repositories/edit-price.repository';
import { EditPriceService } from './services/edit-price.service';
import { PrivateLessonEditPriceController } from './controllers/edit-price.controller';
import { PrivateLessonEmailSelectedRepository } from './repositories/private-lesson-actions/private-lesson-email-selected.repository';
import { PrivateLessonEmailSelectedService } from './services/private-lesson-actions/private-lesson-email-selected.service';
import { PrivateLessonEmailSelectedController } from './controllers/private-lesson-email-selected.controller';
import { TeacherSubstituteController } from './controllers/teacher-substitute.controller';
import { TeacherSubstituteService } from './services/teacher-substitute.service';
import { TeacherSubstituteRepository } from './repositories/teacher-substitute.repository';
import { TeacherSubstituteHierarchyHelper } from './repositories/helpers/teacher-substitute/teacher-substitute-hierarchy.helper';
import { TeacherSubstitutePrivateLessonHelper } from './repositories/helpers/teacher-substitute/teacher-substitute-private-lesson.helper';
import { TeacherSubstituteGroupLessonHelper } from './repositories/helpers/teacher-substitute/teacher-substitute-group-lesson.helper';
import { TeacherSubstitutePaymentHelper } from './repositories/helpers/teacher-substitute/teacher-substitute-payment.helper';
import { TeacherSubstituteDiscountHelper } from './repositories/helpers/teacher-substitute/teacher-substitute-discount.helper';
import { LessonExplodeController } from './controllers/lesson-explode.controller';
import { LessonExplodeService } from './services/private-lesson-actions/lesson-explode.service';
import { LessonExplodeRepository } from './repositories/private-lesson-actions/lesson-explode.repository';
import { UserLocation } from '../user/entities/user-location.entity';
import { TeacherAvailability } from '../teacher/entities/teacher-availability.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { GroupLessonEmailStatus } from './entities/group-lesson-email-status.entity';
import { NotificationEmailType } from '../customer/entities/notification-email-type.entity';
import { EquipmentRental } from '../equipment-rental/entities/equipment-rental.entity';
import { GroupLessonDiscountController } from './controllers/group-lesson-discount.controller';
import { GroupLessonDiscountService } from './services/group-lesson-discount.service';
import { GroupLessonDiscountRepository } from './repositories/group-lesson-discount.repository';
import { CustomerBalanceRecalculatorService } from '../shared/services/customer-balance-recalculator.service';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';
import { RoyaltyLedgerModule } from '../payment/royalty-ledger.module';

@Module({
  imports: [
    RoyaltyLedgerModule,
    TypeOrmModule.forFeature([
      Note,
      Lesson,
      PrivateLesson,
      PrivateLessonEmailStatus,
      GroupLesson,
      Location,
      LocationAvailability,
      User,
      Student,
      Enrolment,
      Course,
      CourseExtra,
      CourseProgramRate,
      LessonHierarchy,
      CourseSchedule,
      Qualification,
      Program,
      Payment,
      Holiday,
      CustomerAccount,
      LessonDiscount,
      LessonPayment,
      CustomerDiscount,
      EnrolmentDiscount,
      PaymentCycle,
      EnrolmentPaymentFrequency,
      Invoice,
      Payment,
      CalendarEventColor,
      BulkRescheduleLesson,
      PaymentCycleLesson,
      UserProfile,
      EmailTemplate,
      EmailObject,
      UserEmail,
      UserContact,
      Classroom,
      InvoiceLineItem,
      InvoiceItemLesson,
      InvoiceLineItemDiscount,
      InvoicePayment,
      CreditUsage,
      Item,
      LessonSplitUsage,
      ReasonsToUnschedule,
      UserLocation,
      TeacherAvailability,
      RbacAuthAssignment,
      GroupLessonEmailStatus,
      NotificationEmailType,
      EquipmentRental,
    ]),
    CustomerValidationModule,
    AuthModule,
    InvoiceModule,
    // For EnrolmentPrepaidPricingService, used at enrolment confirmation to put
    // the payment cycles it has just built onto the published prepaid prices.
    PricingModule,
    LocationModule,
    LogModule,
  ],
  controllers: [
    GenerateInvoiceController,
    LessonPaymentController,
    LessonController,
    ValidateEditScheduleController,
    LessonEditScheduleController,
    ExtraLessonController,
    CourseLessonController,
    PrivateLessonListController,
    UnscheduledLessonListController,
    LessonDetailController,
    UserScheduleLessonController,
    GroupLessonInvoiceController,
    LessonAttendanceController,
    LessonEmailStatementController,
    PrivateLessonEditClassroomController,
    PrivateLessonEditDurationController,
    PrivateLessonEditDiscountController,
    PrivateLessonDeleteController,
    LessonUnscheduleController,
    PrivateLessonEditTaxController,
    PrivateLessonEditOnlineTypeController,
    PrivateLessonBulkRescheduleController,
    PrivateLessonEditPriceController,
    PrivateLessonEmailSelectedController,
    TeacherSubstituteController,
    LessonExplodeController,
    GroupLessonDiscountController,
  ],
  providers: [
    PrivateLessonService, 
    GroupLessonService, 
    GroupLessonDueService,
    PrivateLessonDueService,
    GroupLessonDueTransformationService,
    GroupLessonDueCalculationService,
    PrivateLessonDueTransformationService,
    PrivateLessonDueCalculationService,
    PrivateLessonRepository, 
    GroupLessonRepository,
    GroupLessonDueRepository,
    PrivateLessonDueRepository,
    PrepaidLessonRepository,
    LessonInstructionHoursRepository,
    LessonRepository,
    ValidateEditScheduleRepository,
    TeacherOverlapValidator,
    TeacherEligibilityValidator,
    StudentOverlapValidator,
    TeacherQualificationRepository,
    AbsentLessonRepository,
    UnscheduledLessonRepository,
    ReceivePaymentGroupLessonService,
    ReceivePaymentGroupLessonTransformationService,
    ReceivePaymentLessonService,
    ReceivePaymentLessonTransformationService,
    PrepaidLessonService,
    PrepaidLessonTransformationService,
    LessonService,
    LessonTransformationService,
    LessonValidationService,
    ValidateEditScheduleService,
    PrivateLessonCreateService,
    ExtraLessonRateService,
    LessonChangeService,
    PrivateLessonListService,
    PrivateLessonListRepository,
    PrivateLessonListTransformationService,
    UnscheduledLessonListService,
    UnscheduledLessonListRepository,
    UnscheduledLessonListTransformationService,
    LessonReviewService,
    LessonConfirmationService,
    LessonTeacherChangeService,
    LessonTeacherChangeRepository,
    LessonDetailService,
    GroupLessonInvoiceService,
    LessonDetailRepository,
    GroupLessonInvoiceRepository,
    LessonScheduleRepository,
    LessonScheduleTransformationService,
    LessonPaymentRepository,
    LessonPaymentTransformationService,
    LessonPaymentService,
    CourseLessonRepository,
    EditClassroomRepository,
    EditClassroomService,
    EditDurationRepository,
    EditDurationService,
    EditDiscountRepository,
    EditDiscountService,
    PrivateLessonDeleteRepository,
    PrivateLessonDeleteService,
    LessonUnscheduleRepository,
    LessonUnscheduleService,
    LessonEditScheduleRepository,
    LessonEditScheduleService,
    PrivateLessonEditOnlineTypeRepository,
    PrivateLessonEditOnlineTypeService,
    PrivateLessonBulkRescheduleRepository,
    PrivateLessonBulkRescheduleService,
    PrivateLessonEmailSelectedRepository,
    PrivateLessonEmailSelectedService,
    EmailQueueService,
    MailerService,
    LocationRepository,
    TeacherSubstituteService,
    TeacherSubstituteRepository,
    TeacherSubstituteHierarchyHelper,
    TeacherSubstitutePrivateLessonHelper,
    TeacherSubstituteGroupLessonHelper,
    TeacherSubstitutePaymentHelper,
    TeacherSubstituteDiscountHelper,
    LessonAttendanceService,
    LessonAttendanceRepository,
    LessonEmailStatementService,
    LessonEmailStatementRepository,
    LessonEmailStatementTransformationService,
    PrivateLessonInvoiceService,
    PrivateLessonInvoiceRepository,
    EditTaxRepository,
    EditTaxService,
    CustomerBalanceRecalculatorService,
    CustomerBalanceCalculationRepository,
    EditPriceRepository,
    EditPriceService,
    LessonExplodeService,
    LessonExplodeRepository,
    GroupLessonDiscountService,
    GroupLessonDiscountRepository,
  ],
  exports: [
    PrivateLessonService, 
    GroupLessonService, 
    GroupLessonDueService,
    PrivateLessonDueService,
    PrivateLessonInvoiceService,
    GroupLessonInvoiceService,
    ReceivePaymentGroupLessonService,
    ReceivePaymentLessonService,
    PrepaidLessonService,
    LessonInstructionHoursRepository,
    LessonRepository,
    PrivateLessonRepository,
    GroupLessonRepository,
    AbsentLessonRepository,
    UnscheduledLessonRepository,
    LessonConfirmationService,
    LessonService,
    CourseLessonRepository,
    LessonReviewService,
  ],
})
export class LessonModule {}
