import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../../student/entities/student.entity';

export interface ExaminationPortalStudentRow {
  firstName: string;
  lastName: string;
  locationSlug: string;
  locationName: string;
}

@Injectable()
export class ExaminationPortalStudentRepository {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  async findForCustomerAtLocation(
    customerId: number,
    locationId: number,
  ): Promise<ExaminationPortalStudentRow[]> {
    return this.studentRepository
      .createQueryBuilder('student')
      .innerJoin('student.user', 'customer')
      .innerJoin('customer.userLocation', 'userLocation')
      .innerJoin('userLocation.location', 'location')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :studentDeleted', { studentDeleted: 0 })
      .andWhere('customer.isDeleted = :customerDeleted', {
        customerDeleted: false,
      })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .select('student.firstName', 'firstName')
      .addSelect('student.lastName', 'lastName')
      .addSelect('location.slug', 'locationSlug')
      .addSelect('location.name', 'locationName')
      .orderBy('student.firstName', 'ASC')
      .addOrderBy('student.lastName', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .getRawMany<ExaminationPortalStudentRow>();
  }
}
