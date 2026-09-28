import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException } from "@nestjs/common";
import { Qualification } from "src/qualification/entities/qualification.entity";
import { Repository, EntityManager, MoreThan } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Program } from "src/program/entities/program.entity";
import { Lesson } from "src/lesson/entities/lesson.entity";
import { LessonStatusEnum } from "src/lesson/enums/lesson-status";

@Injectable()
export class TeacherQualificationRepository {
  constructor(
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async getTeacherQualifications(
    teacherId: number,
    type: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ qualifications: Qualification[]; total: number }> {

    console.log('type', type);
    try {
      const skip = (page - 1) * limit;

      const queryBuilder = this.qualificationRepository
        .createQueryBuilder('qualification')
        .leftJoinAndSelect('qualification.program', 'program')
        .where('qualification.teacherId = :teacherId', { teacherId })
        .andWhere('program.type = :type', { type })
        .andWhere('qualification.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('program.isDeleted = :isDeleted', { isDeleted: false })
        .orderBy('program.name', 'DESC');

      const [qualifications, total] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return { qualifications, total };
    } catch (error) {
      console.error('Error in getTeacherQualifications repository:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher qualifications');
    }
  }

  /**
   * Validates that programs exist, are not deleted, and match the qualification type
   */
  async validatePrograms(programIds: number[], qualificationType: number): Promise<Program[]> {
    if (!programIds || programIds.length === 0) {
      throw new BadRequestException('At least one program must be provided');
    }

    const programs = await this.programRepository
      .createQueryBuilder('program')
      .where('program.id IN (:...ids)', { ids: programIds })
      .andWhere('program.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('program.status = :status', { status: Program.STATUS_ACTIVE })
      .andWhere('program.type = :type', { type: qualificationType })
      .getMany();

    if (programs.length !== programIds.length) {
      const foundIds = programs.map(p => p.id);
      const missingIds = programIds.filter(id => !foundIds.includes(id));
      throw new NotFoundException(
        `One or more programs not found, inactive, or type mismatch: ${missingIds.join(', ')}`
      );
    }

    return programs;
  }

  /**
   * Creates multiple qualification records (one per program) in a transaction
   */
  async createTeacherQualifications(
    teacherId: number,
    programIds: number[],
    qualificationType: number,
    rate: number | null,
    userId: number,
  ): Promise<Qualification[]> {
    return this.qualificationRepository.manager.transaction(async (manager: EntityManager) => {
      const now = new Date();
      const qualifications: Qualification[] = [];

      for (const programId of programIds) {
        // Check if qualification already exists for this teacher and program
        const existing = await manager.findOne(Qualification, {
          where: {
            teacherId,
            programId,
            isDeleted: false,
          },
        });

        if (existing) {
          // Update existing qualification instead of creating duplicate
          existing.rate = rate ?? existing.rate;
          existing.updatedOn = now;
          existing.updatedByUserId = userId;
          await manager.save(Qualification, existing);
          qualifications.push(existing);
        } else {
          // Create new qualification using query builder for explicit control
          const qualificationData: any = {
            teacherId,
            programId,
            type: qualificationType,
            isDeleted: false,
            createdOn: now,
            updatedOn: now,
            createdByUserId: userId,
            updatedByUserId: userId,
          };

          // Only include rate if provided (query builder handles null/undefined differently)
          if (rate !== null && rate !== undefined) {
            qualificationData.rate = rate;
          }

          const insertResult = await manager
            .createQueryBuilder()
            .insert()
            .into(Qualification)
            .values(qualificationData)
            .execute();

          const savedId = insertResult.identifiers[0].id as number;
          const saved = await manager.findOne(Qualification, {
            where: { id: savedId },
            relations: ['program'],
          });
          
          if (saved) {
            qualifications.push(saved);
          }
        }
      }

      return qualifications;
    });
  }

  /**
   * Updates a qualification and updates related lessons' teacherRate
   */
  async updateTeacherQualification(
    qualificationId: number,
    rate: number,
    userId: number,
  ): Promise<Qualification> {
    return this.qualificationRepository.manager.transaction(async (manager: EntityManager) => {
      // Find the qualification
      const qualification = await manager.findOne(Qualification, {
        where: { id: qualificationId, isDeleted: false },
        relations: ['program'],
      });

      if (!qualification) {
        throw new NotFoundException('Qualification not found');
      }

      // Update qualification
      const now = new Date();
      qualification.rate = rate;
      qualification.updatedOn = now;
      qualification.updatedByUserId = userId;
      await manager.save(Qualification, qualification);

      // Update related lessons' teacherRate
      // Matches legacy: lessons that are not deleted, confirmed, not canceled (status != CANCELED), not expired
      // and (status = UNSCHEDULED OR (status IN [SCHEDULED, RESCHEDULED] AND date > today))
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // First, find lessons that match the criteria using TypeORM query builder
      const lessons = await manager
        .createQueryBuilder(Lesson, 'lesson')
        .innerJoin('lesson.course', 'course')
        .innerJoin('course.program', 'program')
        .where('lesson.teacherId = :teacherId', { teacherId: qualification.teacherId })
        .andWhere('program.id = :programId', { programId: qualification.programId })
        .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
        .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
        .andWhere('lesson.status != :expiredStatus', { expiredStatus: LessonStatusEnum.EXPIRED })
        .andWhere(
          '(lesson.status = :unscheduledStatus OR (lesson.status IN (:...scheduledStatuses) AND DATE(lesson.date) > :today))',
          {
            unscheduledStatus: LessonStatusEnum.UNSCHEDULED,
            scheduledStatuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
            today: today.toISOString().split('T')[0], // Format: YYYY-MM-DD
          }
        )
        .getMany();

      // Update teacherRate for all matching lessons using TypeORM
      if (lessons.length > 0) {
        const lessonIds = lessons.map(l => l.id);
        await manager
          .createQueryBuilder()
          .update(Lesson)
          .set({ teacherRate: rate })
          .where('id IN (:...ids)', { ids: lessonIds })
          .execute();
      }

      return qualification;
    });
  }

  /**
   * Deletes a qualification (soft delete by setting isDeleted = true)
   */
  async deleteTeacherQualification(
    qualificationId: number,
    userId: number,
  ): Promise<void> {
    const qualification = await this.qualificationRepository.findOne({
      where: { id: qualificationId, isDeleted: false },
    });

    if (!qualification) {
      throw new NotFoundException('Qualification not found');
    }

    const now = new Date();
    qualification.isDeleted = true;
    qualification.updatedOn = now;
    qualification.updatedByUserId = userId;
    await this.qualificationRepository.save(qualification);
  }
}

