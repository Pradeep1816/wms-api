import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TeacherUnavailability } from '../entities/teacher-unavailability.entity';
import { User } from '../../user/entities/user.entity';
import { getCurrentESTDate } from 'src/utils/date-utils';

@Injectable()
export class TeacherUnavailabilityRepository {
  constructor(
    @InjectRepository(TeacherUnavailability)
    private readonly teacherUnavailabilityRepository: Repository<TeacherUnavailability>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private async lockTeacherRow(
    manager: EntityManager,
    teacherId: number,
  ): Promise<void> {
    await manager
      .createQueryBuilder(User, 'user')
      .where('user.id = :teacherId', { teacherId })
      .setLock('pessimistic_write')
      .getOne();
  }

  private async hasOverlappingUnavailabilityWithManager(
    manager: EntityManager,
    teacherId: number,
    fromDateTime: Date,
    toDateTime: Date,
    excludeId?: number,
  ): Promise<boolean> {
    const start = new Date(fromDateTime.getTime() + 1000);
    const end = new Date(toDateTime.getTime() - 1000);

    const query = manager
      .createQueryBuilder(TeacherUnavailability, 'unavailability')
      .where('unavailability.teacherId = :teacherId', { teacherId })
      .andWhere('unavailability.isDeleted = :isDeleted', { isDeleted: false });

    if (excludeId) {
      query.andWhere('unavailability.id != :excludeId', { excludeId });
    }

    query.andWhere(
      `(
        unavailability.fromDateTime BETWEEN :start AND :end
        OR unavailability.toDateTime BETWEEN :start AND :end
        OR (unavailability.fromDateTime < :start AND unavailability.toDateTime > :end)
      )`,
      { start, end },
    );

    const conflict = await query.getOne();
    return !!conflict;
  }

  async findByTeacher(
    teacherId: number,
  ): Promise<TeacherUnavailability[]> {
    try {
      return await this.teacherUnavailabilityRepository
        .createQueryBuilder('unavailability')
        .where('unavailability.teacherId = :teacherId', { teacherId })
        .andWhere('unavailability.isDeleted = :isDeleted', { isDeleted: false })
        .orderBy('unavailability.fromDateTime', 'ASC')
        .getMany();
    } catch (error) {
      console.error('Error in TeacherUnavailabilityRepository:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher unavailability');
    }
  }

  async findByIdAndTeacher(
    id: number,
    teacherId: number,
  ): Promise<TeacherUnavailability | null> {
    return this.teacherUnavailabilityRepository.findOne({
      where: {
        id,
        teacherId,
        isDeleted: false,
      },
    });
  }

  async createTeacherUnavailability(
    teacherId: number,
    fromDateTime: Date,
    toDateTime: Date,
    userId: number,
    reason: string,
  ): Promise<TeacherUnavailability> {
    return this.teacherUnavailabilityRepository.manager.transaction(
      async (manager: EntityManager) => {
        await this.lockTeacherRow(manager, teacherId);

        const hasOverlap = await this.hasOverlappingUnavailabilityWithManager(
          manager,
          teacherId,
          fromDateTime,
          toDateTime,
        );
        if (hasOverlap) {
          throw new BadRequestException('Teacher unavailability is overlapped');
        }

        const now = getCurrentESTDate();
        const entity = manager.create(TeacherUnavailability, {
          teacherId,
          fromDateTime,
          toDateTime,
          reason,
          isDeleted: false,
          createdOn: now,
          updatedOn: now,
          createdByUserId: userId,
          updatedByUserId: userId,
        });

        return manager.save(TeacherUnavailability, entity);
      },
    );
  }

  async updateTeacherUnavailability(
    entity: TeacherUnavailability,
    fromDateTime: Date,
    toDateTime: Date,
    userId: number,
    reason: string,
  ): Promise<TeacherUnavailability> {
    return this.teacherUnavailabilityRepository.manager.transaction(
      async (manager: EntityManager) => {
        await this.lockTeacherRow(manager, entity.teacherId);

        const existing = await manager
          .createQueryBuilder(TeacherUnavailability, 'unavailability')
          .where('unavailability.id = :id', { id: entity.id })
          .andWhere('unavailability.teacherId = :teacherId', {
            teacherId: entity.teacherId,
          })
          .andWhere('unavailability.isDeleted = :isDeleted', {
            isDeleted: false,
          })
          .setLock('pessimistic_write')
          .getOne();

        if (!existing) {
          throw new NotFoundException(
            `Teacher unavailability with id ${entity.id} not found`,
          );
        }

        const hasOverlap = await this.hasOverlappingUnavailabilityWithManager(
          manager,
          entity.teacherId,
          fromDateTime,
          toDateTime,
          entity.id,
        );
        if (hasOverlap) {
          throw new BadRequestException('Teacher unavailability is overlapped');
        }

        existing.fromDateTime = fromDateTime;
        existing.toDateTime = toDateTime;
        existing.reason = reason;
        existing.updatedOn = getCurrentESTDate();
        existing.updatedByUserId = userId;

        return manager.save(TeacherUnavailability, existing);
      },
    );
  }

  async softDeleteTeacherUnavailability(
    entity: TeacherUnavailability,
    userId: number,
  ): Promise<void> {
    await this.teacherUnavailabilityRepository.manager.transaction(
      async (manager: EntityManager) => {
        await this.lockTeacherRow(manager, entity.teacherId);

        const existing = await manager
          .createQueryBuilder(TeacherUnavailability, 'unavailability')
          .where('unavailability.id = :id', { id: entity.id })
          .andWhere('unavailability.teacherId = :teacherId', {
            teacherId: entity.teacherId,
          })
          .andWhere('unavailability.isDeleted = :isDeleted', {
            isDeleted: false,
          })
          .setLock('pessimistic_write')
          .getOne();

        if (!existing) {
          throw new NotFoundException(
            `Teacher unavailability with id ${entity.id} not found`,
          );
        }

        existing.isDeleted = true;
        existing.updatedOn = getCurrentESTDate();
        existing.updatedByUserId = userId;
        await manager.save(TeacherUnavailability, existing);
      },
    );
  }

  async hasOverlappingUnavailability(
    teacherId: number,
    fromDateTime: Date,
    toDateTime: Date,
    excludeId?: number,
  ): Promise<boolean> {
    const start = new Date(fromDateTime.getTime() + 1000);
    const end = new Date(toDateTime.getTime() - 1000);

    const query = this.teacherUnavailabilityRepository
      .createQueryBuilder('unavailability')
      .where('unavailability.teacherId = :teacherId', { teacherId })
      .andWhere('unavailability.isDeleted = :isDeleted', { isDeleted: false });

    if (excludeId) {
      query.andWhere('unavailability.id != :excludeId', { excludeId });
    }

    query.andWhere(
      `(
        unavailability.fromDateTime BETWEEN :start AND :end
        OR unavailability.toDateTime BETWEEN :start AND :end
        OR (unavailability.fromDateTime < :start AND unavailability.toDateTime > :end)
      )`,
      { start, end },
    );

    const count = await query.getCount();
    return count > 0;
  }
}
