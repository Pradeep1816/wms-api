import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LocationService } from '../../location/services/location.service';
import { LessonStatusEnum } from '../enums/lesson-status';

@Injectable()
export class TeacherOverlapValidator {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    private readonly locationService: LocationService,
  ) {}

  /**
   * Validate if a teacher is already occupied with another lesson during the same time period.
   * Mirrors legacy TeacherLessonOverlapValidator behavior for edit-schedule validation.
   */
  async validateTeacherOverlap(
    teacherId: number,
    lessonId: number,
    lessonDate: Date,
    duration: string,
    locationId: number,
  ): Promise<void> {
    // Date part (Y-m-d) using local time (matches legacy DATE(lesson.date))
    const lessonDateStr = `${lessonDate.getFullYear()}-${this.pad(
      lessonDate.getMonth() + 1,
    )}-${this.pad(lessonDate.getDate())}`;

    // Start time in local time (matches legacy TIME(lesson.date))
    const startHours = lessonDate.getHours();
    const startMinutes = lessonDate.getMinutes();
    const startSeconds = lessonDate.getSeconds();
    const startTime = this.formatTime(startHours, startMinutes, startSeconds);

    // Parse duration (HH:mm or HH:mm:ss) and compute end time - 1 second (legacy behavior)
    const [hStr, mStr, sStr] = duration.split(':');
    const durHours = parseInt(hStr, 10) || 0;
    const durMinutes = parseInt(mStr, 10) || 0;
    const durSeconds = sStr ? parseInt(sStr, 10) || 0 : 0;
    const totalSeconds = durHours * 3600 + durMinutes * 60 + durSeconds;

    const endDate = new Date(lessonDate.getTime() + totalSeconds * 1000 - 1000);
    const endHours = endDate.getHours();
    const endMinutes = endDate.getMinutes();
    const endSeconds = endDate.getSeconds();
    const endTime = this.formatTime(endHours, endMinutes, endSeconds);

    const count = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .where('lesson.teacherId = :teacherId', { teacherId })
      .andWhere('lesson.id != :lessonId', { lessonId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isPresent = :isPresent', { isPresent: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('DATE(lesson.date) = :lessonDate', { lessonDate: lessonDateStr })
      .andWhere(
        `(
          TIME(lesson.date) BETWEEN :startTime AND :endTime
          OR
          DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND)
            BETWEEN :startTime AND :endTime
          OR
          (
            TIME(lesson.date) < :startTime
            AND
            DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND) > :endTime
          )
        )`,
        { startTime, endTime },
      )
      .getCount();

    if (count > 0) {
      throw new BadRequestException('Teacher occupied with another lesson');
    }
  }

  private formatTime(h: number, m: number, s: number): string {
    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}

