import { Module } from '@nestjs/common';
// Course module - handles course related operations
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './entities/course.entity';
import { CourseProgramRate } from './entities/course-program-rate.entity';
import { CourseSchedule } from './entities/course-schedule.entity';
import { CourseGroup } from './entities/course-group.entity';
import { CourseExtra } from './entities/course-extra.entity';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { Program } from '../program/entities/program.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { LessonHierarchy } from '../lesson/entities/lesson-hierarchy.entity';
import { GroupLessonEmailStatus } from '../lesson/entities/group-lesson-email-status.entity';
import { GroupLesson } from '../lesson/entities/group-lesson.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { PaymentCycleLesson } from '../lesson/entities/payment-cycle-lesson.entity';
import { LessonPayment } from '../lesson/entities/lesson-payment.entity';
import { LessonDiscount } from '../lesson/entities/lesson-discount.entity';
import { LessonSplitUsage } from '../lesson/entities/lesson-split-usage.entity';
import { Payment } from '../payment/entities/payment.entity';
import { CreditUsage } from '../payment/entities/credit-usage.entity';
import { NotificationEmailType } from '../customer/entities/notification-email-type.entity';
import { Qualification } from '../qualification/entities/qualification.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { User } from '../user/entities/user.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { Student } from '../student/entities/student.entity';
import { TeacherAvailability } from '../teacher/entities/teacher-availability.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { InvoiceItemLesson } from '../invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { CourseController } from './controllers/course.controller';
import { GroupCourseListController } from './controllers/group-course-list.controller';
import { CourseDetailsController } from './controllers/course-details.controller';
import { CourseService } from './services/course.service';
import { GroupCourseListService } from './services/group-course-list.service';
import { GroupCourseCreateService } from './services/group-course-create.service';
import { CourseLessonReviewService } from './services/course-lesson-review.service';
import { CourseLessonApplyAllService } from './services/course-lesson-apply-all.service';
import { CourseLessonConfirmService } from './services/course-lesson-confirm.service';
import { CourseDeleteService } from './services/course-delete.service';
import { CourseLessonEditOnlineTypeService } from './services/course-lesson-edit-online-type.service';
import { CourseDetailsService } from './services/course-details.service';
import { CourseLessonService } from './services/course-lesson.service';
import { CourseStudentService } from './services/course-student.service';
import { CourseReviewLessonDeleteService } from './services/course-review-lesson-delete.service';
import { GroupCourseListRepository } from './repositories/group-course-list.repository';
import { GroupCourseCreateRepository } from './repositories/group-course-create.repository';
import { CourseLessonReviewRepository } from './repositories/course-lesson-review.repository';
import { CourseLessonConfirmRepository } from './repositories/course-lesson-confirm.repository';
import { CourseDeleteRepository } from './repositories/course-delete.repository';
import { CourseLessonEditOnlineTypeRepository } from './repositories/course-lesson-edit-online-type.repository';
import { CourseDetailsRepository } from './repositories/course-details.repository';
import { CourseStudentRepository } from './repositories/course-student.repository';
import { CourseReviewLessonDeleteRepository } from './repositories/course-review-lesson-delete.repository';
import { GroupCourseListTransformationService } from './services/transformation/group-course-list-transformation.service';
import { CourseDetailsTransformationService } from './services/transformation/course-details-transformation.service';
import { CourseLessonTransformationService } from './services/transformation/course-lesson-transformation.service';
import { CourseLessonReviewTransformationService } from './services/transformation/course-lesson-review-transformation.service';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { LessonModule } from '../lesson/lesson.module';
import { LogModule } from '../log/log.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      CourseProgramRate,
      CourseSchedule,
      CourseGroup,
      CourseExtra,
      Enrolment,
      Program,
      Student,
      Lesson,
      LessonHierarchy,
      GroupLessonEmailStatus,
      GroupLesson,
      PrivateLesson,
      PaymentCycleLesson,
      LessonPayment,
      LessonDiscount,
      LessonSplitUsage,
      Payment,
      CreditUsage,
      NotificationEmailType,
      Qualification,
      Holiday,
      User,
      UserLocation,
      TeacherAvailability,
      RbacAuthAssignment,
      InvoiceItemLesson,
      InvoiceLineItem,
      Invoice,
    ]),
    AuthModule,
    LocationModule,
    LessonModule,
    LogModule,
  ],
  controllers: [CourseController, GroupCourseListController, CourseDetailsController],
  providers: [
    CourseService,
    GroupCourseListService,
    GroupCourseCreateService,
    CourseLessonReviewService,
    CourseLessonApplyAllService,
    CourseLessonConfirmService,
    CourseDeleteService,
    CourseLessonEditOnlineTypeService,
    CourseDetailsService,
    CourseLessonService,
    CourseStudentService,
    CourseReviewLessonDeleteService,
    GroupCourseListRepository,
    GroupCourseCreateRepository,
    CourseLessonReviewRepository,
    CourseLessonConfirmRepository,
    CourseDeleteRepository,
    CourseLessonEditOnlineTypeRepository,
    CourseDetailsRepository,
    CourseStudentRepository,
    CourseReviewLessonDeleteRepository,
    GroupCourseListTransformationService,
    CourseDetailsTransformationService,
    CourseLessonTransformationService,
    CourseLessonReviewTransformationService,
  ],
  exports: [TypeOrmModule, CourseService, GroupCourseListService, GroupCourseCreateService, CourseLessonReviewService, CourseDeleteService],
})
export class CourseModule {}
