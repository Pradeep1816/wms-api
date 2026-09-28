import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../entities/student.entity';

@Injectable()
export class StudentUpdateRepository {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  /**
   * Update student by ID using transaction
   * @param studentId - The student ID to update
   * @param locationId - The location ID for verification
   * @param updateData - The data to update
   * @param updatedByUserId - The user ID who is updating
   * @returns The updated student
   */
  async updateStudent(
    studentId: number,
    locationId: number,
    updateData: Partial<Student>,
    updatedByUserId: number,
  ): Promise<Student> {
    const queryRunner = this.studentRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify student exists and belongs to the location
      const student = await queryRunner.manager
        .createQueryBuilder()
        .select('student')
        .from('student', 'student')
        .leftJoin('user', 'user', 'user.id = student.customer_id')
        .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
        .where('student.id = :studentId', { studentId })
        .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 })
        .andWhere('userLocation.location_id = :locationId', { locationId })
        .getRawOne();

      if (!student) {
        throw new Error('Student not found');
      }

      // Update student record
      await queryRunner.manager
        .createQueryBuilder()
        .update('student')
        .set({
          ...updateData,
          updatedByUserId,
        })
        .where('id = :studentId', { studentId })
        .execute();

      await queryRunner.commitTransaction();

      // Return updated student
      const updatedStudent = await this.studentRepository.findOne({
        where: { id: studentId },
      });

      return updatedStudent as Student;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
