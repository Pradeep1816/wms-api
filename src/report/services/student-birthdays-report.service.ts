import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { BirthdaysResponseDto } from '../dto/student-birthday-dto/birthdays.response.dto';
import { StudentBirthdaysReportRepository } from '../repositories/student-birthdays-report.repository';
const { formatLegacyDate } = require('../../utils/date-utils');

@Injectable()
export class BirthdaysReportService {
  constructor(
    @InjectRepository(Location) private readonly locationRepository: Repository<Location>,
    private readonly studentBirthdaysReportRepository: StudentBirthdaysReportRepository,
  ) {}


  /**
   * Get student birthdays
   * @param locationSlug
   * @param startDate
   * @param endDate
   * @param page
   * @param limit
   * @returns
   */
  
  async getStudentBirthdays(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 20,
  ): Promise<BirthdaysResponseDto> {
    //defaults: today to today+7 days
    const today = new Date();
    const start = startDate ? new Date(startDate) : new Date(today.toISOString().slice(0, 10));
    const end = endDate ? new Date(endDate) : new Date(new Date(today).setDate(today.getDate() + 7));

    const location = await this.locationRepository.findOne({ where: { slug: locationSlug } });
    if (!location) {
      return {
        body: [],
        meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    const startKey = start.toISOString().slice(5, 10); // MM-DD
    const endKey = end.toISOString().slice(5, 10);     // MM-DD
    const crossesYear = endKey < startKey;

    const { data, total } = await this.studentBirthdaysReportRepository.getStudentBirthdays({
      locationId: location.id,
      startKey,
      endKey,
      crossesYear,
      page,
      limit,
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const studentBirthdays = data.map((r: any) => ({
      studentId: String(r.studentId),
      studentName: (r.studentName || '').trim(),
      customerId: String(r.customerId),
      customerName: (r.customerName || '').trim(),
      phoneNumber: (r.phoneNumber || '').trim(),
      email: (r.email || '').trim(),
      birthDate: formatLegacyDate(new Date(r.birthDate)),
    }));

    return {
      body: studentBirthdays,
      meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
      pagination: { page, limit, total, totalPages },
    };
  }
}


