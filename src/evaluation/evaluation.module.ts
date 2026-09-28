import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamResult } from './entities/exam-result.entity';
import { EvaluationStudentRepository } from './repositories/evaluation-student.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamResult]),
    AuthModule,
  ],
  controllers: [],
  providers: [EvaluationStudentRepository],
  exports: [EvaluationStudentRepository],
})
export class EvaluationModule {}
