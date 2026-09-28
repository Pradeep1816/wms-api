import { Injectable } from '@nestjs/common';
import {
  TeacherStudentsResponseDto,
  TeacherStudentDto,
} from '../../dto/teacher-students-response.dto';
import { Student } from '../../../student/entities/student.entity';

@Injectable()
export class TeacherStudentsTransformationService {
  transformToResponse(
    students: Student[],
  ): TeacherStudentDto[] {
    return students.map((student) => {
      const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();

      return {
        id: student.id,
        fullName,
      };
    });
  }
}

