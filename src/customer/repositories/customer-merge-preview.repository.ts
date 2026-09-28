import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';

@Injectable()
export class MergeCustomerPreviewRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  

  async findCustomerForMergePreview(customerId: number, locationId: number): Promise<any | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.rbacAuthAssignment', 'rbacAuthAssignment')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.students', 'students')
      .innerJoin('user.userLocation', 'userLocation')
      .leftJoin('user.locationWalkin', 'locationWalkin')
      .where('rbacAuthAssignment.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = 0')
      .andWhere('locationWalkin.customerId IS NULL')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.id = :customerId', { customerId })
      .getOne();
    
  }

  async getEnrolments(customerId: number, locationId: number): Promise<Enrolment[]> {
    const currentDate = new Date().toISOString().split('T')[0];

    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.courseSchedule', 'courseSchedule')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'profile')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.type = :regularType', { regularType: 1 })
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(enrolment.endDateTime) >= :currentDate', { currentDate })
      .groupBy('enrolment.id')
      .getMany();
  }
}


