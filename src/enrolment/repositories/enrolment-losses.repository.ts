import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';

@Injectable()
export class EnrolmentLossesRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  async getLosses(locationId: number, fromDate: string, toDate: string): Promise<Array<{ name: string; count: string }>> {
    const queryBuilder = this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .leftJoin('course', 'course', 'enrolment.courseId = course.id AND course.isDeleted = :isDeleted', { isDeleted: false })
      .leftJoin('program', 'program', 'course.programId = program.id')
      .select([
        'program.name as name',
        'COUNT(enrolment.id) as count',
      ])
      .where('enrolment.isConfirmed = :enrolmentConfirmed', { enrolmentConfirmed: true })
      .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(course.endDate) BETWEEN :fromDate AND :toDate', { fromDate, toDate })
      .andWhere('course.type = :courseType', { courseType: 1 })
      .groupBy('course.programId, program.name')
      .orderBy('count', 'DESC');

    return queryBuilder.getRawMany();
  }
}


