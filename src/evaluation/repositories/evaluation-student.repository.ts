import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { ExamResult } from '../entities/exam-result.entity';
import { CreateStudentEvaluationDto } from '../../student/dto/create-student-evaluation.dto';
import { UpdateStudentEvaluationDto } from '../../student/dto/update-student-evaluation.dto';

@Injectable()
export class EvaluationStudentRepository {
  constructor(
    @InjectRepository(ExamResult)
    private readonly examResultRepository: Repository<ExamResult>,
  ) {}

  /**
   * Validate that a program exists
   */
  private async validateProgram(queryRunner: QueryRunner, programId: number): Promise<void> {
    const program = await queryRunner.manager
      .createQueryBuilder()
      .select('program')
      .from('program', 'program')
      .where('program.id = :programId', { programId })
      .getRawOne();

    if (!program) {
      throw new Error(`Program with ID ${programId} not found`);
    }
  }

  /**
   * Validate that a teacher exists
   */
  private async validateTeacher(queryRunner: QueryRunner, teacherId: number): Promise<void> {
    const teacher = await queryRunner.manager
      .createQueryBuilder()
      .select('user')
      .from('user', 'user')
      .where('user.id = :teacherId', { teacherId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .getRawOne();

    if (!teacher) {
      throw new Error(`Teacher with ID ${teacherId} not found`);
    }
  }

  /**
   * Find evaluation by ID with all relations
   */
  async findEvaluationById(id: number): Promise<ExamResult | null> {
    return await this.examResultRepository.findOne({
      where: { id: id, isDeleted: false },
      relations: ['program', 'student', 'student.user', 'student.user.profile', 'teacher', 'teacher.profile'],
    });
  }

  /**
   * Get evaluations by student ID with pagination and sorting
   */
  async getEvaluationsByStudentId(
    studentId: number,
    page: number = 1,
    limit: number = 10,
    sort: string = 'mark',
    order: 'ASC',
  ): Promise<{ evaluations: ExamResult[]; total: number }> {
    const offset = (page - 1) * limit;

    const queryBuilder = this.examResultRepository
      .createQueryBuilder('examResult')
      .leftJoinAndSelect('examResult.student', 'student')
      .leftJoinAndSelect('examResult.program', 'program')
      .leftJoinAndSelect('examResult.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('examResult.studentId = :studentId', { studentId })
      .andWhere('examResult.isDeleted = :isDeleted', { isDeleted: false });

    // Apply sorting
    const sortMapping = {
      mark: 'examResult.mark',
      level: 'examResult.level',
    };
    const sortColumn = sortMapping[sort] || sortMapping.mark;
    queryBuilder.orderBy(sortColumn, order);

    const [evaluations, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { evaluations, total };
  }

  /**
   * Create a new evaluation for a student
   */
  async createEvaluation(data: CreateStudentEvaluationDto, studentId?: number): Promise<any> {
    const queryRunner = this.examResultRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate program and teacher exist
      await this.validateProgram(queryRunner, data.programId);
      await this.validateTeacher(queryRunner, data.teacherId);

      const newEvaluation: Partial<ExamResult> = {
        studentId: studentId,
        date: data.date ? new Date(data.date) : new Date(),
        mark: data.mark,
        level: data.level,
        programId: data.programId,
        type: data.type,
        teacherId: data.teacherId,
        isDeleted: false,
      };

      // Insert evaluation
      const insertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(ExamResult)
        .values(newEvaluation)
        .execute();

      const insertedId = insertResult.identifiers[0].id;

      await queryRunner.commitTransaction();

      const createdEvaluation = await this.examResultRepository.findOne({
        where: { id: insertedId },
        relations: ['program'],
      });

      if (!createdEvaluation) {
        throw new Error('Failed to retrieve created evaluation');
      }

      return createdEvaluation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  

  /**
   * Delete evaluation (soft delete)
   */
  async deleteEvaluation(id: number): Promise<any> {
    await this.examResultRepository.update(
      { id: id },
      { isDeleted: true },
    );
    return {
      id: id,
      deleted: true,
    };
  }

  /**
   * Update evaluation by ID
   */
  async updateEvaluation(id: number, data: UpdateStudentEvaluationDto): Promise<ExamResult> {
    const queryRunner = this.examResultRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate program and teacher exist if provided
      if (data.programId) {
        await this.validateProgram(queryRunner, data.programId);
      }
      if (data.teacherId) {
        await this.validateTeacher(queryRunner, data.teacherId);
      }

      // Build update object with only provided fields
      const updateData: Partial<ExamResult> = {};
      if (data.date !== undefined) updateData.date = new Date(data.date);
      if (data.mark !== undefined) updateData.mark = data.mark;
      if (data.level !== undefined) updateData.level = data.level;
      if (data.programId !== undefined) updateData.programId = data.programId;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.teacherId !== undefined) updateData.teacherId = data.teacherId;

      // Update evaluation
      await queryRunner.manager
        .createQueryBuilder()
        .update(ExamResult)
        .set(updateData)
        .where('id = :id', { id })
        .andWhere('isDeleted = :isDeleted', { isDeleted: false })
        .execute();

      await queryRunner.commitTransaction();

      // Fetch updated evaluation with relations
      const updatedEvaluation = await this.examResultRepository.findOne({
        where: { id, isDeleted: false },
        relations: ['program', 'teacher', 'teacher.profile'],
      });

      if (!updatedEvaluation) {
        throw new Error('Failed to retrieve updated evaluation');
      }

      return updatedEvaluation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
