import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogService } from './services/log.service';
import { LogRepository } from './repositories/log.repository';
import { LogObjectRepository } from './repositories/log-object.repository';
import { LogActivityRepository } from './repositories/log-activity.repository';
import { LogTransformationService } from './services/transformations/log-transformation.service';
import { LogStudentService } from './services/log-student.service';
import { LogMessageFormatterService } from './services/log-message-formatter.service';
import { AuditLogWriterService } from './services/audit-log-writer.service';
import { LogController } from './controllers/log.controller';
import { AuthModule } from '../auth/auth.module';
import { TimelineCreatedUsersRepository } from './repositories/timeline-created-users.repository';
import { TimelineCreatedUsersService } from './services/timeline-created-users.service';

// Import entities
import { Log } from './entities/log.entity';
import { LogHistory } from './entities/log-history.entity';
import { LogLink } from './entities/log-link.entity';
import { LogObject } from './entities/log-object.entity';
import { LogActivity } from './entities/log-activity.entity';
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { LocationModule } from '../location/location.module';
import { Invoice } from 'src/invoice/entities/invoice.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Log,
      LogHistory,
      LogLink,
      LogObject,
      LogActivity,
      User,
      UserProfile,
      RbacAuthAssignment,
      Invoice,
    ]),
    AuthModule,
    LocationModule,
  ],
  controllers: [LogController],
  providers: [
    LogService,
    LogRepository,
    LogObjectRepository,
    LogActivityRepository,
    LogTransformationService,
    LogMessageFormatterService,
    AuditLogWriterService,
    LogStudentService,
    TimelineCreatedUsersRepository,
    TimelineCreatedUsersService,
  ],
  exports: [LogService, LogRepository, LogObjectRepository, LogActivityRepository, LogStudentService, AuditLogWriterService],
})
export class LogModule {}
