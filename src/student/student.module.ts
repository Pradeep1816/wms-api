import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Location } from '../location/entities/location.entity';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { Course } from '../course/entities/course.entity';
import { CourseSchedule } from '../course/entities/course-schedule.entity';
import { PaymentFrequency } from '../payment/entities/payment-frequency.entity';
import { EnrolmentPaymentFrequency } from '../enrolment/entities/enrolment-payment-frequency.entity';
import { CourseProgramRate } from '../course/entities/course-program-rate.entity';
import { EnrolmentDiscount } from '../enrolment/entities/enrolment-discount.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { LessonHierarchy } from '../lesson/entities/lesson-hierarchy.entity';
import { Program } from '../program/entities/program.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { StudentService } from './services/student.service';
import { StudentEnrolmentService } from './services/student-enrolment.service';
import { StudentEvaluationService } from './services/student-evaluation.service';
import { StudentUpdateService } from './services/student-update.service';
import { StudentMergeService } from './services/student-merge.service';
import { StudentDeleteService } from './services/student-delete.service';
import { StudentPrivateLessonsService } from './services/student-lessons.service';
import { StudentAbsentLessonsService } from './services/student-absent-lessons.service';
import { StudentUnscheduledLessonsService } from './services/student-unscheduled-lessons.service';
import { StudentRepository } from './repositories/student.repository';
import { StudentUpdateRepository } from './repositories/student-update.repository';
import { StudentMergeRepository } from './repositories/student-merge.repository';
import { StudentDeleteRepository } from './repositories/student-delete.repository';
import { StudentInfoTransformationService } from './services/transformations/student-info-transformation.service';
import { StudentEnrolmentTransformationService } from './services/transformations/student-enrolment-transformation.service';
import { StudentEvaluationTransformationService } from './services/transformations/student-evaluation-transformation.service';
import { StudentPrivateLessonsTransformationService } from './services/transformations/student-lessons-transformation.service';
import { StudentAbsentLessonsTransformationService } from './services/transformations/student-absent-lessons-transformation.service';
import { StudentUnscheduledLessonsTransformationService } from './services/transformations/student-unscheduled-lessons-transformation.service';
import { StudentInfoController } from './controllers/student-info.controller';
import { StudentEnrolmentsController } from './controllers/student-enrolments.controller';
import { StudentEvaluationController } from './controllers/student-evaluation.controller';
import { StudentPrivateLessonsController } from './controllers/student-lessons.controller';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { LogModule } from '../log/log.module';
import { LessonModule } from '../lesson/lesson.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    PricingModule,
    TypeOrmModule.forFeature([
      Student,
      User,
      Location,
      Enrolment,
      Lesson,
      Course,
      CourseSchedule,
      PaymentFrequency,
      EnrolmentPaymentFrequency,
      CourseProgramRate,
      EnrolmentDiscount,
      PrivateLesson,
      LessonHierarchy,
      Program,
      Holiday,
    ]),
    AuthModule,
    LocationModule,
    EnrolmentModule,
    EvaluationModule,
    LogModule,
    LessonModule,
  ],
  controllers: [
    StudentInfoController,
    StudentEnrolmentsController,
    StudentEvaluationController,
    StudentPrivateLessonsController,
  ],
  providers: [
    StudentService,
    StudentEnrolmentService,
    StudentEvaluationService,
    StudentUpdateService,
    StudentMergeService,
    StudentDeleteService,
    StudentPrivateLessonsService,
    StudentAbsentLessonsService,
    StudentUnscheduledLessonsService,
    StudentRepository,
    StudentUpdateRepository,
    StudentMergeRepository,
    StudentDeleteRepository,
    StudentInfoTransformationService,
    StudentEnrolmentTransformationService,
    StudentEvaluationTransformationService,
    StudentPrivateLessonsTransformationService,
    StudentAbsentLessonsTransformationService,
    StudentUnscheduledLessonsTransformationService,
  ],
  exports: [StudentService, StudentRepository, StudentEnrolmentService],
})
export class StudentModule {}
