import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from './entities/program.entity';
import { CreateProgramDto, UpdateProgramDto, ProgramResponseDto, ProgramListDto } from './dto/program.dto';
import { ProgramRepository } from './repositories/program.repository';
import { ProgramListRequestDto } from './dto/program-list-request.dto';
import { ProgramListDataDto } from './dto/program-list-response.dto';
import { ProgramListRepository } from './repositories/program-list.repository';

@Injectable()
export class ProgramService {
  constructor(
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    private readonly programRepo: ProgramRepository,
    private readonly programListRepository: ProgramListRepository,
  ) {}

  /**
   * Get all active programs (not deleted and status = 1) - returns only id and name
   * Equivalent to: SELECT id, name FROM `program` WHERE (`program`.`isDeleted`=FALSE) AND (`status`=1) ORDER BY `name`;
   * @param type - Optional filter: 'private' for private programs (type=1), 'group' for group programs (type=2)
   * @param studentId - Optional filter: if provided, returns only programs the student is enrolled in
   */
  async findAll(type?: 'private' | 'group', studentId?: number): Promise<ProgramListDto[]> {
    const queryBuilder = this.programRepository
      .createQueryBuilder('program')
      .select(['program.id', 'program.name', 'program.rate'])
      .where('program.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('program.status = :status', { status: Program.STATUS_ACTIVE });

    // Filter by type if provided
    if (type === 'private') {
      queryBuilder.andWhere('program.type = :type', { type: Program.TYPE_PRIVATE_PROGRAM });
    } else if (type === 'group') {
      queryBuilder.andWhere('program.type = :type', { type: Program.TYPE_GROUP_PROGRAM });
    }

    // Filter by student enrolment if studentId is provided
    // Matches SQL: LEFT JOIN course ON (program.id = course.programId) AND (course.isDeleted=FALSE)
    // LEFT JOIN enrolment ON course.id = enrolment.courseId
    // WHERE (course.isConfirmed=TRUE) AND (course.isDeleted=FALSE) AND 
    // ((enrolment.studentId=studentId) AND (enrolment.isDeleted=FALSE) AND (enrolment.isConfirmed=TRUE))
    if (studentId) {
      queryBuilder
        .leftJoin('program.courses', 'course', 'course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
        .leftJoin('course.enrolments', 'enrolment')
        .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
        .andWhere('enrolment.studentId = :studentId', { studentId })
        .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
        .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true });
    }

    queryBuilder.orderBy('program.name', 'ASC');

    const programs = await queryBuilder.getMany();

    return programs.map(program => ({
      id: program.id,
      name: program.name,
      rate: program.rate ?? null,
    }));
  }

  /**
   * Delete a program by ID (soft delete)
   * - Program can only be deleted if no non-deleted courses are associated
   * - Uses soft delete (sets isDeleted = true)
   * @param id - Program ID to delete
   * @param userId - User performing the delete
   * @returns Deleted program information
   */
  async deleteProgram(
    id: number,
    userId: number,
  ) {
    try {
      const deletedResult = await this.programRepo.deleteProgram(id, userId);

      if (!deletedResult || !deletedResult.id) {
        throw new BadRequestException('Failed to delete program');
      }

      return {
        id: deletedResult.id,
        name: deletedResult.name,
        deletedByUserId: userId,
      };
    } catch (error) {
      console.error('Error in deleteProgram service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to delete program');
    }
  }

  /**
   * Update a program by ID
   * Based on SMW-Legacy ProgramController::actionUpdate()
   * 
   * @param id - Program ID to update
   * @param userId - User performing the update
   * @param updateDto - Fields to update (name, rate, status)
   * @returns Updated program information
   */
  async updateProgram(
    id: number,
    userId: number,
    updateDto: UpdateProgramDto,
  ) {
    try {
      const updatedProgram = await this.programRepo.updateProgram(
        id,
        userId,
        updateDto,
      );

      return {
        id: updatedProgram.id,
        name: updatedProgram.name,
        rate: updatedProgram.rate,
        status: updatedProgram.status,
        updatedByUserId: userId,
      };
    } catch (error) {
      console.error('Error in updateProgram service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to update program');
    }
  }

  /**
   * Create a new program
   * @param createDto - Program data (name, rate)
   * @param type - Program type (1=private, 2=group)
   * @param userId - User performing the create
   * @returns Created program information
   */
  async createProgram(
    createDto: CreateProgramDto,
    type: number,
    userId: number,
  ) {
    try {
      const createdProgram = await this.programRepo.createProgram(
        createDto,
        type,
        userId,
      );

      return {
        id: createdProgram.id,
        name: createdProgram.name,
        rate: createdProgram.rate,
        type: createdProgram.type,
        status: createdProgram.status,
        createdByUserId: userId,
      };
    } catch (error) {
      console.error('Error in createProgram service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to create program');
    }
  }

    /*
   * Get programs with filtering, sorting, and pagination
   */
  async getProgramsList(searchDto: ProgramListRequestDto): Promise<ProgramListDataDto> {
    const { page = 1, limit = 20 } = searchDto;
    const { programs, total } = await this.programListRepository.getPrograms(searchDto);

    return {
      body: programs.map((p) => ({
        id: p.id,
        name: p.name,
        rate: p.rate ?? null,
        status: p.status,
        type: p.type,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
