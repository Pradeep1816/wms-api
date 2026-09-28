import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralSource } from './entities/referral-source.entity';
import { ReferralSourceController } from './controllers/referral-source.controller';
import { ReferralSourceService } from './services/referral-source.service';
import { ReferralSourceRepository } from './repositories/referral-source.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralSource]),
    AuthModule,
  ],
  controllers: [ReferralSourceController],
  providers: [ReferralSourceService, ReferralSourceRepository],
  exports: [ReferralSourceService, ReferralSourceRepository],
})
export class ReferralSourceModule {}
