import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { LocationResolveGuard } from '../shared/guards/location.guard';
import { Student } from '../student/entities/student.entity';
import { EducationPortalStudentController } from './controllers/education-portal-student.controller';
import { ArcadiaExaminationsRolloutGuard } from './guards/arcadia-examinations-rollout.guard';
import { ExaminationPortalStudentRepository } from './repositories/examination-portal-student.repository';
import { EducationPortalStudentService } from './services/education-portal-student.service';

@Module({
  imports: [TypeOrmModule.forFeature([Student]), AuthModule, LocationModule],
  controllers: [EducationPortalStudentController],
  providers: [
    LocationResolveGuard,
    ArcadiaExaminationsRolloutGuard,
    ExaminationPortalStudentRepository,
    EducationPortalStudentService,
  ],
})
export class ExaminationModule {}
