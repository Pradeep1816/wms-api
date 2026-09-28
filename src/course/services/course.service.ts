import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, MoreThanOrEqual } from 'typeorm';
import { Course } from '../entities/course.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Program } from '../../program/entities/program.entity';
import { CourseSchedule } from '../entities/course-schedule.entity';
import { CourseProgramRate } from '../entities/course-program-rate.entity';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { GroupCourseOptionDto } from '../dto/fetch-group-courses-response.dto';
import { getWeekdayName } from '../../utils/date-utils';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
  ) {}

  /**
   * Fetch available group courses for a student
   * Excludes courses the student is already enrolled in
   */
  async fetchGroupCourses(
    locationId: number,
    studentId: number,
    courseName?: string,
  ): Promise<GroupCourseOptionDto[]> {
    // Get course IDs the student is already enrolled in (confirmed, not deleted, group programs)
    const enrolledCourseIds = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .select('enrolment.courseId', 'courseId')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.program', 'program')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('enrolment.isConfirmed = :isConfirmed', { isConfirmed: 1 })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: 1 })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('program.type = :programType', { programType: Program.TYPE_GROUP_PROGRAM })
      .getRawMany();

    const enrolledCourseIdList = enrolledCourseIds.map((item) => item.courseId);

    // Build query for available group courses
    const queryBuilder = this.courseRepository
      .createQueryBuilder('course')
      .innerJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect(
        'course.courseSchedule',
        'schedule',
        'schedule.isRecent = :isRecent',
        { isRecent: true },
      )
      .leftJoinAndSelect(
        'course.courseProgramRates',
        'rate',
      )
      .where('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: 1 })
      .andWhere('program.type = :programType', { programType: Program.TYPE_GROUP_PROGRAM })
      .andWhere('DATE(course.endDate) >= :today', {
        today: this.formatDateForQuery(new Date()),
      });

    // Exclude already enrolled courses
    if (enrolledCourseIdList.length > 0) {
      queryBuilder.andWhere('course.id NOT IN (:...enrolledCourseIds)', {
        enrolledCourseIds: enrolledCourseIdList,
      });
    }

    // Optional: filter by course name
    if (courseName) {
      queryBuilder.andWhere('program.name LIKE :courseName', {
        courseName: `%${courseName}%`,
      });
    }

    const courses = await queryBuilder.getMany();

    // Transform to DTO format
    return courses.map((course) => {
      const recentSchedule = course.courseSchedule?.find((s) => s.isRecent) || course.courseSchedule?.[0];
      // uses hasOne(courseProgramRate) without date filtering.
      // taking the first course_program_rate record.
      const firstRate = [...(course.courseProgramRates || [])].sort(
        (a, b) => Number(a.id) - Number(b.id),
      )[0];

      const dayName = getWeekdayName(recentSchedule?.day || 0);

      // Format time from HH:mm:ss to HH:mm AM/PM
      const fromTime = recentSchedule?.fromTime
        ? this.formatTime(recentSchedule.fromTime)
        : '';

      // Format duration from HH:mm:ss to HH:mm
      const duration = recentSchedule?.duration
        ? this.formatDuration(recentSchedule.duration)
        : '';

      // Format dates
      const startDate = course.startDate
        ? this.formatDisplayDate(course.startDate)
        : '';
      const endDate = course.endDate
        ? this.formatDisplayDate(course.endDate)
        : '';

      // Get teacher name
      const teacherName =
        course.teacher?.profile?.firstname && course.teacher?.profile?.lastname
          ? `${course.teacher.profile.firstname} ${course.teacher.profile.lastname}`
          : course.teacher?.profile?.firstname || '';

      const programRate = firstRate?.programRate
        ? Number(firstRate.programRate)
        : course.program?.rate
        ? Number(course.program.rate)
        : 0;

      return {
        id: course.id.toString(),
        course: course.program?.name || '',
        teacher: teacherName,
        day: dayName,
        rate: programRate,
        fromTime,
        duration,
        startDate,
        endDate,
      } as GroupCourseOptionDto;
    });
  }

  /**
   * Format time from HH:mm:ss to HH:mm AM/PM
   */
  private formatTime(timeString: string): string {
    try {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours, 10);
      const minute = minutes || '00';
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minute} ${period}`;
    } catch {
      return timeString;
    }
  }

  /**
   * Format duration from HH:mm:ss to HH:mm
   */
  private formatDuration(durationString: string): string {
    try {
      const [hours, minutes] = durationString.split(':');
      return `${hours}:${minutes}`;
    } catch {
      return durationString;
    }
  }

  /**
   * Format date for SQL query (yyyy-MM-dd)
   */
  private formatDateForQuery(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format date for display (MMM dd, yyyy)
   */
  private formatDisplayDate(date: Date | string): string {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const month = months[dateObj.getMonth()];
      const day = String(dateObj.getDate()).padStart(2, '0');
      const year = dateObj.getFullYear();
      return `${month} ${day}, ${year}`;
    } catch {
      return '';
    }
  }

}
