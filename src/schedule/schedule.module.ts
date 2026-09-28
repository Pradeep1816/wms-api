import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationAvailability } from '../location/entities/location-availability.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { TeacherAvailability } from '../teacher/entities/teacher-availability.entity';
import { TeacherUnavailability } from '../teacher/entities/teacher-unavailability.entity';
import { Qualification } from '../qualification/entities/qualification.entity';
import { Course } from '../course/entities/course.entity';
import { Program } from '../program/entities/program.entity';
import { GroupLesson } from '../lesson/entities/group-lesson.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { LessonHierarchy } from '../lesson/entities/lesson-hierarchy.entity';
import { BulkRescheduleLesson } from '../lesson/entities/bulk-reschedule-lesson.entity';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { Student } from '../student/entities/student.entity';
import { EquipmentRental } from '../equipment-rental/entities/equipment-rental.entity';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { Classroom } from '../classroom/entities/classroom.entity';
import { ClassroomUnavailability } from '../classroom/entities/classroom-unavailability.entity';
import { ScheduleService } from './services/schedule.service';
import { ScheduleController } from './controllers/schedule.controller';
import { DailyScheduleController } from './controllers/daily-schedule.controller';
import { DailyScheduleService } from './services/daily-schedule.service';
import { DailyScheduleRepository } from './repositories/daily-schedule.repository';
import { CustomerUserScheduleRepository } from './repositories/user-schedule.repository';
import { DailyScheduleTransformationService } from './services/transformations/daily-schedule-transformation.service';
import { CustomerUserScheduleService } from './services/user-schedule.service';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { HolidayModule } from '../holiday/holiday.module';
import { ColorCodeModule } from '../color-code/color-code.module';
import { ClassroomModule } from '../classroom/classroom.module';
import { UserScheduleController } from './controllers/user-schedule.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LocationAvailability,
      Holiday,
      User,
      UserProfile,
      UserLocation,
      Lesson,
      RbacAuthAssignment,
      TeacherAvailability,
      TeacherUnavailability,
      Qualification,
      Course,
      Program,
      GroupLesson,
      PrivateLesson,
      LessonHierarchy,
      BulkRescheduleLesson,
      Enrolment,
      Student,
      EquipmentRental,
      CustomerAccount,
      Classroom,
      ClassroomUnavailability,
    ]),
    AuthModule,
    LocationModule,
    HolidayModule,
    ColorCodeModule,
    ClassroomModule,
  ],
  controllers: [
    ScheduleController,
    DailyScheduleController,
    UserScheduleController,
  ],
  providers: [
    ScheduleService,
    DailyScheduleService,
    DailyScheduleRepository,
    CustomerUserScheduleRepository,
    DailyScheduleTransformationService,
    CustomerUserScheduleService,
  ],
  exports: [ScheduleService],
})
export class ScheduleModule {}
