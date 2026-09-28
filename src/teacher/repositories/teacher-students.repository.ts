import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../../student/entities/student.entity';

@Injectable()
export class TeacherStudentsRepository {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  async findStudentsByTeacher(
    teacherId: number,
    locationId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ students: Student[]; total: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const query = this.studentRepository
        .createQueryBuilder('student')
        .distinct(true)
        .innerJoin('student.enrolments', 'enrolment', 'enrolment.isConfirmed = :enrolmentConfirmed', { enrolmentConfirmed: true })
        .innerJoin('enrolment.course', 'course', 'course.locationId = :locationId AND course.teacherId = :teacherId', { locationId, teacherId })
        .where('student.isDeleted = :studentDeleted', { studentDeleted: false });

      const [students, total] = await query
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return { students, total };
    } catch (error) {
      console.error('Error in TeacherStudentsRepository:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve teacher students',
      );
    }
  }
}

