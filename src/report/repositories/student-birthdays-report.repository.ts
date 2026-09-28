import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Student } from '../../student/entities/student.entity';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { UserPhone } from '../../user/entities/user-phone.entity';
import { UserEmail } from '../../user/entities/user-email.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { Location } from '../../location/entities/location.entity';

interface BirthdaysQueryParams {
  locationId: number;
  startKey: string;
  endKey: string;
  crossesYear: boolean;
  page: number;
  limit: number;
}

@Injectable()
export class StudentBirthdaysReportRepository {
  constructor(
    @InjectRepository(Student) private readonly studentRepository: Repository<Student>,
  ) {}

  async getStudentBirthdays(params: BirthdaysQueryParams): Promise<{ data: any[]; total: number }> {
    const { locationId, startKey, endKey, crossesYear, page, limit } = params;

    const dataQuery = this.buildBaseQuery(locationId)
      .select([
        'student.id as studentId',
        "CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, '')) as studentName",
        'student.birthDate as birthDate',
        'user.id as customerId',
        "CONCAT(COALESCE(userProfile.firstname, ''), ' ', COALESCE(userProfile.lastname, '')) as customerName",
        "COALESCE(MAX(CASE WHEN userContact.isPrimary = 1 THEN userPhone.number END), MAX(userPhone.number)) as phoneNumber",
        "COALESCE(MAX(CASE WHEN userContact.isPrimary = 1 THEN userEmail.email END), MAX(userEmail.email)) as email",
      ])
      .groupBy('student.id')
      .addGroupBy('user.id')
      .orderBy("DATE_FORMAT(student.birthDate, '%m-%d')", 'DESC')
      .addOrderBy('student.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    const countQuery = this.buildBaseQuery(locationId);

    this.applyDateFilter(dataQuery, startKey, endKey, crossesYear);
    this.applyDateFilter(countQuery, startKey, endKey, crossesYear);

    const [rows, total] = await Promise.all([
      dataQuery.getRawMany(),
      countQuery.getCount(),
    ]);

    return { data: rows, total };
  }

  private buildBaseQuery(locationId: number): SelectQueryBuilder<Student> {
    return this.studentRepository
      .createQueryBuilder('student')
      .innerJoin(User, 'user', 'user.id = student.customerId')
      .leftJoin(UserProfile, 'userProfile', 'userProfile.user_id = user.id')
      .leftJoin(
        UserContact,
        'userContact',
        'userContact.userId = user.id AND userContact.isDeleted = 0',
      )
      .leftJoin(UserPhone, 'userPhone', 'userPhone.userContactId = userContact.id AND userPhone.isDeleted = 0')
      .leftJoin(UserEmail, 'userEmail', 'userEmail.userContactId = userContact.id AND userEmail.isDeleted = 0')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .innerJoin(Location, 'location', 'location.id = userLocation.location_id')
      .where('location.id = :locationId', { locationId })
      .andWhere('student.birthDate IS NOT NULL')
      .andWhere('student.isDeleted = false')
      .andWhere('student.status = :activeStatus', { activeStatus: 1 });
  }

  private applyDateFilter(
    query: SelectQueryBuilder<Student>,
    startKey: string,
    endKey: string,
    crossesYear: boolean,
  ): void {
    if (!crossesYear) {
      query.andWhere("DATE_FORMAT(student.birthDate, '%m-%d') BETWEEN :s AND :e", { s: startKey, e: endKey });
    } else {
      query.andWhere("DATE_FORMAT(student.birthDate, '%m-%d') >= :s OR DATE_FORMAT(student.birthDate, '%m-%d') <= :e", {
        s: startKey,
        e: endKey,
      });
    }
  }
}

