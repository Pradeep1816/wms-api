import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Holiday } from './entities/holiday.entity';
import { HolidayService } from './services/holiday.service';
import { AuthModule } from '../auth/auth.module';
import { HolidayController } from './controllers/holiday.controller';
import { HolidayRepository } from './repositories/holiday.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Holiday]),
    AuthModule,
  ],
  controllers: [HolidayController],
  providers: [
    HolidayService,
    HolidayRepository,
  ],
  exports: [HolidayService], 
})
export class HolidayModule {}
