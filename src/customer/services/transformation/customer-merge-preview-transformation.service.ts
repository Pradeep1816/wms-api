import { Injectable } from '@nestjs/common';
import { MergePreviewEnrolmentDto, MergePreviewUserDto, MergePreviewStudentDto } from '../../dto/customer-merge-preview-response.dto';
import { formatDate, getWeekdaysList } from '../../../utils/date-utils';
import { formatDuration, formatTime } from '../../../utils/formatters';

@Injectable()
export class CustomerMergePreviewTransformationService {

    transformCustomer(user: any): MergePreviewUserDto {
        const isActive = user?.status === 2;
        const fullName = `${user?.profile?.firstname || ''} ${user?.profile?.lastname || ''}`.trim();

        return {
            id: user?.id,
            isActive,
            fullName,
        };
    }

    transformStudents(students: any[] = []): MergePreviewStudentDto[] {
        
        const studentData=students.map((student: any) => ({
            id: student?.id,
            fullName: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
        }));

        return studentData;
    }

    transformEnrolments(enrolments: any[]): MergePreviewEnrolmentDto[] {
    
        return enrolments.map((enrolment: any) => {
            const student = enrolment?.student;
            const course = enrolment?.course;
            const program = course?.program;
            const courseSchedule = course?.courseSchedule?.[0];
            const teacher = course?.teacher;

            const day = courseSchedule?.day;
            const weekdays = getWeekdaysList();
            const weekday = weekdays[day];
            const fromTime = formatTime(courseSchedule?.fromTime) || '';

            const teacherName = teacher?.profile ?
                `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim() : '';

            return {
                id: enrolment.id,
                studentName: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
                programName: program?.name || '',
                teacherName: teacherName,
                day: weekday,
                fromTime: fromTime,
                duration: formatDuration(courseSchedule?.duration),
                startDate: formatDate(course?.startDate),
                renewalDate: formatDate(enrolment.endDateTime),
            };
        });
    }
}


