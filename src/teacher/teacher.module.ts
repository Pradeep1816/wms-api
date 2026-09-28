import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from '../auth/entities/rbac-auth-item.entity';
import { Qualification } from '../qualification/entities/qualification.entity';
import { Program } from '../program/entities/program.entity';
import { TeacherService } from './services/teacher.service';
import { TeacherController } from './controllers/teacher.controller';
import { TeacherUploadSignatureController } from './controllers/teacher-upload-signature.controller';
import { TeacherAvailabilityController } from './controllers/teacher-availability.controller';
import { TeacherUnavailabilityController } from './controllers/teacher-unavailability.controller';
import { TeacherLessonController } from './controllers/teacher-lesson.controller';
import { TeacherTimeVoucherController } from './controllers/teacher-time-voucher.controller';
import { TeacherDocumentSignatureRequestController } from './controllers/teacher-document-signature-request.controller';
import { TeacherDocumentDisclosureController } from './controllers/teacher-document-disclosure.controller';
import { TeacherConfidentialNoteController } from './controllers/teacher-confidential-note.controller';
import { TeacherCompensationAdjustmentController } from './controllers/teacher-compensation-adjustment.controller';
import { TeacherStudentsController } from './controllers/teacher-students.controller';
import { TeacherQualificationService } from './services/teacher-qualification.service';
import { TeacherQualificationRepository } from './repositories/teacher-qualification.repository';
import { TeacherQualificationTransformationService } from './services/transformations/teacher-qualification-transformation.service';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { TeacherAvailability } from './entities/teacher-availability.entity';
import { TeacherUnavailability } from './entities/teacher-unavailability.entity';
import { TeacherAvailabilityService } from './services/teacher-availability.service';
import { TeacherUnavailabilityService } from './services/teacher-unavailability.service';
import { TeacherAvailabilityRepository } from './repositories/teacher-availability.repository';
import { TeacherUnavailabilityRepository } from './repositories/teacher-unavailability.repository';
import { TeacherAvailabilityTransformationService } from './services/transformations/teacher-availability-transformation.service';
import { TeacherUnavailabilityTransformationService } from './services/transformations/teacher-unavailability-transformation.service';
import { TeacherInvoicedLessonsService } from './services/teacher-invoiced-lessons.service';
import { TeacherInvoicedLessonsRepository } from './repositories/teacher-invoiced-lessons.repository';
import { TeacherInvoicedLessonsTransformationService } from './services/transformations/teacher-invoiced-lessons-transformation.service';
import { TeacherUnscheduledLessonsService } from './services/teacher-unscheduled-lessons.service';
import { TeacherUnscheduledLessonsRepository } from './repositories/teacher-unscheduled-lessons.repository';
import { TeacherUnscheduledLessonsTransformationService } from './services/transformations/teacher-unscheduled-lessons-transformation.service';
import { TeacherTimeVoucherService } from './services/teacher-time-voucher.service';
import { TeacherTimeVoucherRepository } from './repositories/teacher-time-voucher.repository';
import { TeacherTimeVoucherTransformationService } from './services/transformations/teacher-time-voucher-transformation.service';
import { TeacherStudentsService } from './services/teacher-students.service';
import { TeacherStudentsRepository } from './repositories/teacher-students.repository';
import { TeacherStudentsTransformationService } from './services/transformations/teacher-students-transformation.service';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { Student } from '../student/entities/student.entity';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { CourseSchedule } from '../course/entities/course-schedule.entity';
import { Course } from '../course/entities/course.entity';
import { TeacherScheduleService } from './services/teacher-schedule.service';
import { TeacherScheduleRepository } from './repositories/teacher-schedule.repository';
import { TeacherScheduleTransformationService } from './services/transformations/teacher-schedule-transformation.service';
import { TeacherScheduleController } from './controllers/teacher-schedule.controller';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { EquipmentRental } from '../equipment-rental/entities/equipment-rental.entity';
import { CalendarEventColor } from '../color-code/entities/calendar-event-color.entity';
import { LocationAvailability } from '../location/entities/location-availability.entity';
import { TeacherListRepository } from './repositories/teachers-by-program.repository';
import { TeacherRoom } from './entities/teacher-room.entity';
import { TeacherDocumentSignatureRequest } from './entities/teacher-document-signature-request.entity';
import { TeacherDocumentDisclosure } from './entities/teacher-document-disclosure.entity';
import { TeacherConfidentialNote } from './entities/teacher-confidential-note.entity';
import { TeacherCompensationAdjustment } from './entities/teacher-compensation-adjustment.entity';
import { TeacherBulkRescheduleController } from './controllers/teacher-bulk-reschedule.controller';
import { TeacherBulkRescheduleService } from './services/teacher-bulk-reschedule.service';
import { PrivateLessonBulkRescheduleService } from '../lesson/services/private-lesson-actions/private-lesson-bulk-reschedule.service';
import { PrivateLessonBulkRescheduleRepository } from '../lesson/repositories/private-lesson-actions/private-lesson-bulk-reschedule.repository';
import { TeacherDocumentSignatureRequestService } from './services/teacher-document-signature-request.service';
import { TeacherDocumentSignatureRequestRepository } from './repositories/teacher-document-signature-request.repository';
import { TeacherDocumentDisclosureService } from './services/teacher-document-disclosure.service';
import { TeacherDocumentDisclosureRepository } from './repositories/teacher-document-disclosure.repository';
import { TeacherConfidentialNoteService } from './services/teacher-confidential-note.service';
import { TeacherConfidentialNoteRepository } from './repositories/teacher-confidential-note.repository';
import { TeacherCompensationAdjustmentService } from './services/teacher-compensation-adjustment.service';
import { TeacherCompensationAdjustmentRepository } from './repositories/teacher-compensation-adjustment.repository';
import { TeacherUploadSignatureService } from './services/teacher-upload-signature.service';
import { TeacherUploadSignatureRepository } from './repositories/teacher-upload-signature.repository';
import { MailerService } from '../shared/services/mailer.service';
import { TeacherDocumentSignatureTransformationService } from './services/transformations/teacher-document-signature-transformation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserProfile,
      UserLocation,
      RbacAuthAssignment,
      RbacAuthItem,
      Qualification,
      Program,
      TeacherAvailability,
      TeacherUnavailability,
      InvoiceLineItem,
      Invoice,
      Lesson,
      Student,
      Enrolment,
      CourseSchedule,
      Course,
      CustomerAccount,
      EquipmentRental,
      CalendarEventColor,
      LocationAvailability,
      TeacherRoom,
      TeacherDocumentSignatureRequest,
      TeacherDocumentDisclosure,
      TeacherConfidentialNote,
      TeacherCompensationAdjustment,
    ]),
    AuthModule,
    LocationModule,
    CustomerValidationModule,
  ],
  controllers: [
    TeacherController,
    TeacherUploadSignatureController,
    TeacherAvailabilityController,
    TeacherUnavailabilityController,
    TeacherLessonController,
    TeacherTimeVoucherController,
    TeacherStudentsController,
    TeacherScheduleController,
    TeacherBulkRescheduleController,
    TeacherDocumentSignatureRequestController,
    TeacherDocumentDisclosureController,
    TeacherConfidentialNoteController,
    TeacherCompensationAdjustmentController,
  ],
  providers: [
    TeacherService,
    TeacherUploadSignatureService,
    TeacherUploadSignatureRepository,
    TeacherListRepository,
    TeacherQualificationService,
    TeacherQualificationRepository,
    TeacherQualificationTransformationService,
    TeacherDocumentSignatureTransformationService,
    TeacherAvailabilityService,
    TeacherUnavailabilityService,
    TeacherAvailabilityRepository,
    TeacherUnavailabilityRepository,
    TeacherAvailabilityTransformationService,
    TeacherUnavailabilityTransformationService,
    TeacherInvoicedLessonsService,
    TeacherInvoicedLessonsRepository,
    TeacherInvoicedLessonsTransformationService,
    TeacherUnscheduledLessonsService,
    TeacherUnscheduledLessonsRepository,
    TeacherUnscheduledLessonsTransformationService,
    TeacherTimeVoucherService,
    TeacherTimeVoucherRepository,
    TeacherTimeVoucherTransformationService,
    TeacherStudentsService,
    TeacherStudentsRepository,
    TeacherStudentsTransformationService,
    TeacherScheduleService,
    TeacherScheduleRepository,
    TeacherScheduleTransformationService,
    TeacherBulkRescheduleService,
    PrivateLessonBulkRescheduleService,
    PrivateLessonBulkRescheduleRepository,
    TeacherDocumentSignatureRequestService,
    TeacherDocumentSignatureRequestRepository,
    TeacherDocumentDisclosureService,
    TeacherDocumentDisclosureRepository,
    TeacherConfidentialNoteService,
    TeacherConfidentialNoteRepository,
    TeacherCompensationAdjustmentService,
    TeacherCompensationAdjustmentRepository,
    MailerService,
  ],
  exports: [
    TeacherService,
    TeacherInvoicedLessonsService,
    TeacherInvoicedLessonsRepository,
    TeacherUploadSignatureService,
    TeacherUploadSignatureRepository,
  ],
})
export class TeacherModule {}
