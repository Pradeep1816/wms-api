import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditTrailService } from './services/audit-trail.service';
import { AuditTrailQueryService } from './services/audit-trail-query.service';
import { AuditTrailRepository } from './repositories/audit-trail.repository';
import { AuditTrailController } from './controllers/audit-trail.controller';
import { AuditTrailEntryEntity } from './entities/audit-trail-entry.entity';
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditTrailEntryEntity, User, UserProfile]),
    AuthModule,
  ],
  controllers: [AuditTrailController],
  providers: [AuditTrailService, AuditTrailQueryService, AuditTrailRepository],
  exports: [AuditTrailService],
})
export class AuditTrailModule {}
