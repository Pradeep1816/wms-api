import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { EnrolmentListItemDto, EnrolmentListDataDto } from '../../dto/enrolment-list-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { ProgramTypeEnum } from '../../../program/enums/program-type';
@Injectable()
export class EnrolmentListTransformationService {
  /**
   * Transform enrolment entity to EnrolmentListItemDto
    */
  transformEnrolmentToListItem(
    enrolment: any,
    lessonsRemaining: number = 0,
  ): EnrolmentListItemDto {
    const student = enrolment.student;
    const course = enrolment.course;
    const program = course?.program;

    // Get unique teacher names from course schedules (legacy: course->getTeachers())
    const teacherNames = this.getScheduleTeacherNames(course?.courseSchedule);

    const dtoData = {
      id: enrolment.id,
      studentId: student?.id || 0,
      student: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
      program: program?.name || '',
      programType: program?.type === ProgramTypeEnum.GROUP_PROGRAM ? 'Group' : 'Private',
      teacher: teacherNames,
      startDate: formatDate(course?.startDate),
      endDate: formatDate(enrolment.endDateTime),
      autoRenewal: enrolment.isAutoRenew === 1 ? 'Enabled' :  'Disabled',
      lessonsRemaining,
    };

    return plainToInstance(EnrolmentListItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple enrolment entities to EnrolmentListItemDto array
   */
  transformEnrolmentList(
    enrolments: any[],
    lessonsRemainingMap: Map<number, number>,
  ): EnrolmentListItemDto[] {
    return enrolments.map(enrolment => 
      this.transformEnrolmentToListItem(
        enrolment,
        lessonsRemainingMap.get(enrolment.id) || 0,
      )
    );
  }

  /**
   * Transform enrolments data to EnrolmentListDataDto
  */
  transformEnrolmentsData(
    enrolments: any[],
    lessonsRemainingMap: Map<number, number>,
    total: number,
    page: number,
    limit: number,
  ): EnrolmentListDataDto {
    const formattedEnrolments = this.transformEnrolmentList(enrolments, lessonsRemainingMap);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedEnrolments,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(EnrolmentListDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Get unique teacher names from course schedules
   */
  private getScheduleTeacherNames(courseSchedules: any[]): string {
    if (!courseSchedules || courseSchedules.length === 0) {
      return '';
    }

    const uniqueNames = new Set<string>();

    for (const schedule of courseSchedules) {
      const profile = schedule?.teacher?.profile;
      if (profile) {
        const fullName = `${profile.firstname || ''} ${profile.lastname || ''}`.trim();
        if (fullName) {
          uniqueNames.add(fullName);
        }
      }
    }

    return Array.from(uniqueNames).join(', ');
  }
}
