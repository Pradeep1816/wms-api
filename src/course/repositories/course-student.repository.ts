import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../../student/entities/student.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';

export interface CourseStudentItem {
  id: number;
  studentId: number;
  customerId: number;
  studentName: string;
  customerName: string;
  discount: string;
}

export interface CourseStudentResult {
  students: CourseStudentItem[];
  total: number;
}

export interface CourseStudentParams {
  courseId: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class CourseStudentRepository {
  // EnrolmentDiscount constants
  static readonly TYPE_GROUP = 3;
  static readonly VALUE_TYPE_DOLLAR = 1;

  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Get students enrolled in a group course
   */
  async findStudentsByCourseId(params: CourseStudentParams): Promise<CourseStudentResult> {
    const { courseId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const today = new Date().toISOString().split('T')[0];

    const query = this.studentRepository
      .createQueryBuilder('student')
      .innerJoin('student.enrolments', 'enrolment')
      .innerJoin('enrolment.course', 'course')
      .leftJoin('student.user', 'customer')
      .leftJoin('customer.profile', 'customerProfile')
      .select([
        'student.id AS id',
        'student.id AS studentId',
        'CONCAT(student.first_name, " ", student.last_name) AS studentName',
        'customer.id AS customerId',
        'COALESCE(CONCAT(customerProfile.firstname, " ", customerProfile.lastname), customer.username) AS customerName',
        'enrolment.id AS enrolmentId',
      ])
      .where('student.isDeleted = false')
      .andWhere('course.id = :courseId', { courseId })
      .andWhere('course.isConfirmed = true')
      .andWhere('course.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('DATE(enrolment.endDateTime) >= :today', { today })
      .andWhere('enrolment.studentId IS NOT NULL');

    const total = await query.getCount();

    const students = await query
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Get discount for each student
    const result = await Promise.all(
      students.map(async (student) => {
        const discount = await this.getGroupDiscountValue(student.enrolmentId);
        return {
          id: student.id,
          enrolmentId: student.enrolmentId,
          studentId: student.studentId,
          customerId: student.customerId,
          studentName: student.studentName,
          customerName: student.customerName,
          discount,
        };
      }),
    );

    return { students: result, total };
  }

  /**
   * Get group discount value for an enrolment
   */
  private async getGroupDiscountValue(enrolmentId: number): Promise<string> {
    const result = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .leftJoin(
        'enrolment_discount',
        'discount',
        'discount.enrolmentId = enrolment.id AND discount.type = :discountType',
        { discountType: CourseStudentRepository.TYPE_GROUP },
      )
      .select([
        'discount.discount AS discountValue',
        'discount.discountType AS discountType',
      ])
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .getRawOne();

    if (!result || result.discountValue === null || result.discountValue === undefined) {
      return 'Not set';
    }

    // VALUE_TYPE_DOLLAR = 1, VALUE_TYPE_PERCENTAGE = 0
    return result.discountType === CourseStudentRepository.VALUE_TYPE_DOLLAR
      ? `$${result.discountValue}`
      : `${result.discountValue}%`;
  }
}
