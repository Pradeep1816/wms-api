import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../entities/student.entity';
import { Note } from '../../comment/entities/notes.entity';
import { LogObjectType } from '../../log/enums/log-object-type.enum';

@Injectable()
export class StudentMergeRepository {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  /**
   * Execute merge operation in a transaction
   * Transfers all data from source to target and soft-deletes source
   * If any step fails, all changes are rolled back
   */
  async merge(
    sourceStudent: Student,
    targetStudentId: number,
    userId: number,
  ): Promise<any> {
    const sourceStudentId = sourceStudent.id;

    try {
      await this.studentRepository.manager.transaction(async (transactionManager) => {
        // Transfer enrolments from source to target
        await transactionManager
          .createQueryBuilder()
          .update('enrolment')
          .set({ studentId: targetStudentId })
          .where('studentId = :sourceId', { sourceId: sourceStudentId })
          .execute();

        // Transfer notes from source to target (where instanceType = student)
        await transactionManager
          .createQueryBuilder()
          .update('note')
          .set({ instanceId: targetStudentId })
          .where('instanceId = :sourceId', { sourceId: sourceStudentId })
          .andWhere('instanceType = :instanceType', { instanceType: Note.INSTANCE_TYPE_STUDENT })
          .execute();

        // Transfer log history from source to target (where instanceType = student)
        await transactionManager
          .createQueryBuilder()
          .update('log_history')
          .set({ instanceId: targetStudentId })
          .where('instanceId = :sourceId', { sourceId: sourceStudentId })
          .andWhere('instanceType = :instanceType', { instanceType: LogObjectType.STUDENT })
          .execute();

        // Transfer exam results from source to target
        await transactionManager
          .createQueryBuilder()
          .update('exam_result')
          .set({ studentId: targetStudentId })
          .where('studentId = :sourceId', { sourceId: sourceStudentId })
          .execute();

        // Soft delete the source student
        sourceStudent.isDeleted = 1;
        sourceStudent.updatedOn = new Date();
        sourceStudent.updatedByUserId = userId;
        await transactionManager.save(sourceStudent);
      });
      return {sourceStudentId, targetStudentId};
    } catch (error) {
      console.error('Error in executeMerge repository:', error);
      throw error;
    }
  }
}
