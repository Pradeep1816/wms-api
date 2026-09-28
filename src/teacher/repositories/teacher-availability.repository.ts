import { Injectable, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { TeacherAvailability } from '../entities/teacher-availability.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { ModifyTeacherAvailabilityDto } from '../dto/modify-teacher-availability.dto';
import { TeacherRoom } from '../entities/teacher-room.entity';

@Injectable()
export class TeacherAvailabilityRepository {
  constructor(
    @InjectRepository(TeacherAvailability)
    private readonly teacherAvailabilityRepository: Repository<TeacherAvailability>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(TeacherRoom)
    private readonly teacherRoomRepository: Repository<TeacherRoom>,
  ) {}

  async findByTeacherAndLocation(
    teacherId: number,
    locationId: number,
  ): Promise<(TeacherAvailability & { classroomName?: string })[]> {
    try {
      const availabilities = await this.teacherAvailabilityRepository
        .createQueryBuilder('availability')
        .innerJoin('availability.userLocation', 'userLocation')
        .leftJoin('teacher_room', 'teacherRoom', 'teacherRoom.teacherAvailabilityId = availability.id')
        .leftJoin('classroom', 'classroom', 'classroom.id = teacherRoom.classroomId AND classroom.isDeleted = :classroomNotDeleted', { classroomNotDeleted: false })
        .select([
          'availability.id',
          'availability.teacherLocationId',
          'availability.day',
          'availability.fromTime',
          'availability.toTime',
          'availability.isDeleted',
          'availability.createdOn',
          'availability.updatedOn',
          'availability.createdByUserId',
          'availability.updatedByUserId',
        ])
        .addSelect('classroom.name', 'classroomName')
        .where('userLocation.userId = :teacherId', { teacherId })
        .andWhere('userLocation.locationId = :locationId', { locationId })
        .andWhere('availability.isDeleted = :isDeleted', { isDeleted: false })
        .orderBy('availability.day', 'ASC')
        .addOrderBy('availability.fromTime', 'ASC')
        .getRawMany();

      // Map raw results to TeacherAvailability entities with classroomName
      return availabilities.map((row) => ({
        id: row.availability_id,
        teacherLocationId: row.availability_teacher_location_id,
        day: row.availability_day,
        fromTime: row.availability_from_time,
        toTime: row.availability_to_time,
        isDeleted: row.availability_isDeleted === 1 || row.availability_isDeleted === true,
        createdOn: row.availability_createdOn,
        updatedOn: row.availability_updatedOn,
        createdByUserId: row.availability_createdByUserId,
        updatedByUserId: row.availability_updatedByUserId,
        classroomName: row.classroomName || undefined,
      })) as (TeacherAvailability & { classroomName?: string })[];
    } catch (error) {
      console.error('Error in TeacherAvailabilityRepository:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher availability');
    }
  }

  /**
   * Modifies teacher availability (create or update) and handles classroom assignment
   * Matches legacy actionModify behavior
   */
  async modifyTeacherAvailability(
    availabilityId: number,
    teacherId: number,
    locationId: number,
    dto: ModifyTeacherAvailabilityDto,
    userId: number,
  ): Promise<TeacherAvailability> {
    return this.teacherAvailabilityRepository.manager.transaction(async (manager: EntityManager) => {
      // Get teacher's userLocation
      const userLocation = await manager.findOne(UserLocation, {
        where: { userId: teacherId, locationId },
      });

      if (!userLocation) {
        throw new NotFoundException(`Teacher location not found for teacher ${teacherId} in location ${locationId}`);
      }

      // Validate no overlapping availability (matches legacy validation)
      // Check for existing availability on same day with overlapping time range
      const overlappingQuery = manager
        .createQueryBuilder(TeacherAvailability, 'availability')
        .where('availability.day = :day', { day: dto.day })
        .andWhere('availability.teacherLocationId = :teacherLocationId', { teacherLocationId: userLocation.id })
        .andWhere('availability.isDeleted = :isDeleted', { isDeleted: false });

      // Exclude current availability if updating
      if (availabilityId !== 0) {
        overlappingQuery.andWhere('availability.id != :availabilityId', { availabilityId });
      }

      // Check for time overlap: 
      // - from_time BETWEEN new_from AND new_to
      // - OR (to_time - 1 second) BETWEEN new_from AND new_to  
      // - OR (from_time <= new_from AND (to_time - 1 second) >= new_to)
      const toTimeMinusOne = new Date(`2000-01-01 ${dto.toTime}`);
      toTimeMinusOne.setSeconds(toTimeMinusOne.getSeconds() - 1);
      const toTimeMinusOneStr = toTimeMinusOne.toTimeString().substring(0, 8);

      overlappingQuery.andWhere(
        `(
          availability.from_time BETWEEN :fromTime AND :toTimeMinusOne
          OR DATE_SUB(availability.to_time, INTERVAL 1 SECOND) BETWEEN :fromTime AND :toTimeMinusOne
          OR (availability.from_time <= :fromTime AND DATE_SUB(availability.to_time, INTERVAL 1 SECOND) >= :toTimeMinusOne)
        )`,
        {
          fromTime: dto.fromTime,
          toTimeMinusOne: toTimeMinusOneStr,
        }
      );

      const overlapping = await overlappingQuery.getOne();

      if (overlapping) {
        throw new BadRequestException('Availability time overlaps with existing availability');
      }

      // Get or create TeacherAvailability
      let availability: TeacherAvailability;
      if (availabilityId === 0) {
        // Create new
        availability = manager.create(TeacherAvailability, {
          teacherLocationId: userLocation.id,
          day: dto.day,
          fromTime: dto.fromTime,
          toTime: dto.toTime,
          isDeleted: false,
          createdOn: new Date(),
          updatedOn: new Date(),
          createdByUserId: userId,
          updatedByUserId: userId,
        });
        availability = await manager.save(TeacherAvailability, availability);
      } else {
        // Update existing
        const existingAvailability = await manager.findOne(TeacherAvailability, {
          where: { id: availabilityId, isDeleted: false },
        });

        if (!existingAvailability) {
          throw new NotFoundException(`Teacher availability with id ${availabilityId} not found`);
        }

        existingAvailability.day = dto.day;
        existingAvailability.fromTime = dto.fromTime;
        existingAvailability.toTime = dto.toTime;
        existingAvailability.updatedOn = new Date();
        existingAvailability.updatedByUserId = userId;
        availability = await manager.save(TeacherAvailability, existingAvailability);
      }

      // Handle classroom assignment
      if (dto.classroomId) {
        // Find matching lessons and update their classroomId
        // Matches legacy: notDeleted, notCanceled, notCompleted, privateLessons, teacherAvailability, teacherAvailabilityDay
        const lessons = await manager
          .createQueryBuilder(Lesson, 'lesson')
          .innerJoin('lesson.course', 'course')
          .innerJoin('course.program', 'program')
          .where('lesson.teacherId = :teacherId', { teacherId })
          .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
          .andWhere('lesson.status != :completedStatus', { completedStatus: LessonStatusEnum.COMPLETED })
          .andWhere('program.type = :privateType', { privateType: 1 }) // Private program type
          .andWhere('TIME(lesson.date) >= :fromTime', { fromTime: dto.fromTime })
          .andWhere('TIME(lesson.date) < :toTime', { toTime: dto.toTime })
          .andWhere('DAYOFWEEK(lesson.date) = :day', { day: dto.day === 7 ? 1 : dto.day + 1 }) // MySQL DAYOFWEEK: 1=Sunday, 2=Monday...7=Saturday
          .getMany();

        // Update lessons' classroomId
        if (lessons.length > 0) {
          const lessonIds = lessons.map(l => l.id);
          await manager
            .createQueryBuilder()
            .update(Lesson)
            .set({ classroomId: dto.classroomId })
            .where('id IN (:...ids)', { ids: lessonIds })
            .execute();
        }

        // Save or update TeacherRoom using TypeORM
        // TeacherRoom table only has: id, classroomId, teacherAvailabilityId
        // Check if TeacherRoom exists
        const existingRoom = await manager.findOne(TeacherRoom, {
          where: { teacherAvailabilityId: availability.id },
        });

        if (existingRoom) {
          // Update existing
          existingRoom.classroomId = dto.classroomId;
          await manager.save(TeacherRoom, existingRoom);
        } else {
          // Create new
          const teacherRoom = manager.create(TeacherRoom, {
            teacherAvailabilityId: availability.id,
            classroomId: dto.classroomId,
          });
          await manager.save(TeacherRoom, teacherRoom);
        }
      } else {
        // Delete TeacherRoom if no classroom assigned
        await manager.delete(TeacherRoom, {
          teacherAvailabilityId: availability.id,
        });
      }

      return availability;
    });
  }

  /**
   * Deletes a teacher availability (soft delete by setting isDeleted = true)
   * Matches legacy actionDelete behavior
   */
  async deleteTeacherAvailability(
    availabilityId: number,
    userId: number,
  ): Promise<void> {
    const availability = await this.teacherAvailabilityRepository.findOne({
      where: { id: availabilityId, isDeleted: false },
    });

    if (!availability) {
      throw new NotFoundException(`Teacher availability with id ${availabilityId} not found`);
    }

    // Soft delete
    const now = new Date();
    availability.isDeleted = true;
    availability.updatedOn = now;
    availability.updatedByUserId = userId;
    await this.teacherAvailabilityRepository.save(availability);

    // Also delete associated TeacherRoom records
    await this.teacherRoomRepository.delete({
      teacherAvailabilityId: availabilityId,
    });
  }
}

