import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { Program } from '../entities/program.entity';
import { Course } from '../../course/entities/course.entity';
import { CreateProgramDto, UpdateProgramDto } from '../dto/program.dto';
import { getCurrentESTDate } from 'src/utils/date-utils';

@Injectable()
export class ProgramRepository {
  constructor(
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  /**
   * Get existing program by ID (not deleted)
   */
  private async getExistingProgram(
    id: number,
    queryRunner: QueryRunner,
  ): Promise<Program | null> {
    return await queryRunner.manager
      .createQueryBuilder()
      .select('program')
      .from(Program, 'program')
      .where('program.id = :id', { id })
      .andWhere('program.isDeleted = false')
      .getOne();
  }

  /**
   * Check if program has associated courses (not deleted)
   */
  private async hasCourses(
    programId: number,
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const count = await queryRunner.manager
      .createQueryBuilder()
      .select('course')
      .from(Course, 'course')
      .where('course.programId = :programId', { programId })
      .andWhere('course.isDeleted = false')
      .getCount();

    return count > 0;
  }

  /**
   * Delete a program by ID (soft delete)
   * Based on SMW-Legacy ProgramController::actionDelete()
   * 
   * Business Logic:
   * - Program can only be deleted if no non-deleted courses are associated
   * - Uses soft delete (sets isDeleted = true)
   * 
   * @param id - Program ID to delete
   * @param userId - User performing the delete
   * @returns Deleted program information
   */
  async deleteProgram(
    id: number,
    userId: number,
  ): Promise<{ id: number; name: string; deletedOn: Date }> {
    const queryRunner =
      this.programRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find program
      const existingProgram = await this.getExistingProgram(id, queryRunner);

      if (!existingProgram) {
        throw new NotFoundException(`Program with ID ${id} not found`);
      }

      // Check if program is deletable (no courses associated)
      const hasCourses = await this.hasCourses(id, queryRunner);

      if (hasCourses) {
        throw new BadRequestException(
          'Unable to delete. There are courses associated with this program.',
        );
      }

      const deletedOn = getCurrentESTDate();

      // Soft delete the program
      await queryRunner.manager
        .createQueryBuilder()
        .update(Program)
        .set({
          isDeleted: true,
          updatedOn: deletedOn,
          updatedByUserId: userId,
        })
        .where('id = :id', { id })
        .execute();

      await queryRunner.commitTransaction();

      return {
        id: id,
        name: existingProgram.name,
        deletedOn: deletedOn,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update a program by ID
   * @param id - Program ID to update
   * @param userId - User performing the update
   * @param updateDto - Fields to update (name, rate, status)
   * @returns Updated program
   */
  async updateProgram(
    id: number,
    userId: number,
    updateDto: UpdateProgramDto,
  ): Promise<Program> {
    const queryRunner =
      this.programRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingProgram = await this.getExistingProgram(id, queryRunner);

      if (!existingProgram) {
        throw new NotFoundException(`Program with ID ${id} not found`);
      }

      const updateData: Partial<Program> = {};

      if (updateDto.name !== undefined) updateData.name = updateDto.name;
      if (updateDto.rate !== undefined) updateData.rate = updateDto.rate;
      if (updateDto.status !== undefined) updateData.status = updateDto.status;

      updateData.updatedOn = getCurrentESTDate();
      updateData.updatedByUserId = userId;

      await queryRunner.manager
        .createQueryBuilder()
        .update(Program)
        .set(updateData)
        .where('id = :id', { id })
        .execute();

      const updatedProgram = await queryRunner.manager.findOne(Program, {
        where: { id },
      });

      if (!updatedProgram) {
        throw new Error('Failed to fetch updated program');
      }

      await queryRunner.commitTransaction();
      return updatedProgram;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Create a new program
   * @param createDto - Program data (name, rate)
   * @param type - Program type (1=private, 2=group)
   * @param userId - User performing the create
   * @returns Created program
   */
  async createProgram(
    createDto: CreateProgramDto,
    type: number,
    userId: number,
  ): Promise<Program> {
    const queryRunner =
      this.programRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const now = getCurrentESTDate();

      const insertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Program)
        .values({
          name: createDto.name,
          rate: createDto.rate,
          type: type,
          status: Program.STATUS_ACTIVE,
          isDeleted: false,
          createdOn: now,
          updatedOn: now,
          createdByUserId: userId,
          updatedByUserId: userId,
        })
        .execute();

      const newId = insertResult.identifiers[0].id;

      const createdProgram = await queryRunner.manager.findOne(Program, {
        where: { id: newId },
      });

      if (!createdProgram) {
        throw new Error('Failed to fetch created program');
      }

      await queryRunner.commitTransaction();
      return createdProgram;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
