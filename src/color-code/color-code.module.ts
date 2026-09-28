import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarEventColor } from './entities/calendar-event-color.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CalendarEventColorRepository } from './repositories/calendar-event-color.repository';
import { CalendarEventColorService } from './services/calendar-event-color.service';
import { CalendarEventColorController } from './controllers/calendar-event-color.controller';
import { CalendarEventColorTransformationService } from './services/transformations/calendar-event-color-transformation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CalendarEventColor,
    ]),
    AuthModule
  ],
  providers: [CalendarEventColorRepository,CalendarEventColorService,CalendarEventColorTransformationService],
  controllers: [CalendarEventColorController],
  exports: [
    TypeOrmModule,
  ],
})
export class ColorCodeModule {}
