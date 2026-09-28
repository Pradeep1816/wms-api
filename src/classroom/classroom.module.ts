import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Classroom } from './entities/classroom.entity';
import { ClassroomUnavailability } from './entities/classroom-unavailability.entity';
import { ClassroomController } from './controllers/classroom.controller';
import { ClassroomUnavailabilityController } from './controllers/classroom-unavailability.controller';
import { ClassroomService } from './services/classroom.service';
import { ClassroomUnavailabilityService } from './services/classroom-unavailability.service';
import { ClassroomRepository } from './repositories/classroom.repository';
import { ClassroomUnavailabilityRepository } from './repositories/classroom-unavailability.repository';
import { AuthModule } from 'src/auth/auth.module';
import { LocationModule } from 'src/location/location.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Classroom,
      ClassroomUnavailability,
    ]),
    AuthModule,
    LocationModule,
  ],
  controllers: [
    ClassroomController,
    ClassroomUnavailabilityController,
  ],
  providers: [
    ClassroomService,
    ClassroomRepository,
    ClassroomUnavailabilityService,
    ClassroomUnavailabilityRepository,
  ],
  exports: [
    ClassroomService,
    ClassroomUnavailabilityService,
  ],
})
export class ClassroomModule {}
