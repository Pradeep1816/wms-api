import { PricingModule } from '../pricing/pricing.module';
import { Program } from '../program/entities/program.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { ProgramModule } from '../program/program.module';
import { TeacherModule } from '../teacher/teacher.module';
import { CustomerModule } from '../customer/customer.module';
import { StudentModule } from '../student/student.module';
import { MailerService } from '../shared/services/mailer.service';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { User } from '../user/entities/user.entity';
import { City } from '../location/entities/city.entity';
import { Province } from '../location/entities/province.entity';
import { Country } from '../location/entities/country.entity';
import {
  DigitalEnrollmentInvitation,
} from './entities/digital-enrollment-invitation.entity';
import {
  DigitalEnrollmentAdminController,
  DigitalEnrollmentSubmissionController,
} from './controllers/digital-enrollment-submission.controller';
import {
  EnrolmentPolicyController,
  PublicEnrolmentPolicyController,
} from './controllers/enrolment-policy.controller';
import { DigitalEnrollmentSubmission } from './entities/digital-enrollment-submission.entity';
import { EnrolmentPolicy } from './entities/enrolment-policy.entity';
import { EnrolmentPolicyRepository } from './repositories/enrolment-policy.repository';
import { DigitalEnrollmentSubmissionService } from './services/digital-enrollment-submission.service';
import { EnrolmentPolicyService } from './services/enrolment-policy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Program,
      DigitalEnrollmentInvitation,
      DigitalEnrollmentSubmission,
      EnrolmentPolicy,
      Enrolment,
      User,
      City,
      Province,
      Country,
    ]),
    PricingModule,
    AuthModule,
    LocationModule,
    ProgramModule,
    TeacherModule,
    CustomerModule,
    StudentModule,
  ],
  controllers: [
    DigitalEnrollmentSubmissionController,
    DigitalEnrollmentAdminController,
    PublicEnrolmentPolicyController,
    EnrolmentPolicyController,
  ],
  providers: [
    DigitalEnrollmentSubmissionService,
    EnrolmentPolicyService,
    EnrolmentPolicyRepository,
    MailerService,
  ],
  exports: [EnrolmentPolicyService],
})
export class DigitalEnrollmentModule {}
