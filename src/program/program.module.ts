import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Program } from './entities/program.entity';
import { ProgramService } from './program.service';
import { ProgramController } from './program.controller';
import { ProgramRepository } from './repositories/program.repository';
import { Course } from '../course/entities/course.entity';
import { ProgramListRepository } from './repositories/program-list.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Program, Course]), AuthModule],
  controllers: [ProgramController],
  providers: [ProgramService, ProgramListRepository, ProgramRepository],
  exports: [ProgramService],
})
export class ProgramModule {}
