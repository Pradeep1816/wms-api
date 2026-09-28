import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportRentalReportsRequestDto, ReportRentalFilterType } from '../dto/rental-dto/rental-reports.request.dto';
import { EquipmentRental } from '../../equipment-rental/entities/equipment-rental.entity';
import { RentalReportsResponseDto } from '../dto/rental-dto/rental-reports.response.dto';
import { RentalReportItemDto } from '../dto/rental-dto/rental-report-item.dto';
import { Location } from '../../location/entities/location.entity';
const { parseFlexibleDate, formatLegacyDate } = require('../../utils/date-utils');

@Injectable()
export class RentalReportService {
  constructor(
    @InjectRepository(EquipmentRental) private readonly equipmentRentalRepository: Repository<EquipmentRental>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    
    
  ) { }


  private resolveDates(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  // Backward-compatible wrapper for controller expecting getRentalReports
async getRentalReports(
    locationSlug: string,
    searchDto: ReportRentalReportsRequestDto,
  ): Promise<any> {
    // Prefer explicit showOptions , otherwise map from filterType
    let showOptions: string | undefined = searchDto.showOptions;
    if (showOptions === undefined) {
      switch (searchDto.filterType) {
      case ReportRentalFilterType.ACTIVE_CURRENT:
          showOptions = '0';
        break;
      case ReportRentalFilterType.ACTIVE_OVERDUE:
          showOptions = '1';
        break;
      case ReportRentalFilterType.ACTIVE_EXPIRING:
          showOptions = '2';
        break;
      case ReportRentalFilterType.ALL:
      default:
          showOptions = undefined;
        break;
    }
  }
    const page = searchDto.page || 1;
    const limit = searchDto.limit || 20;
    return this.getRentalReport(locationSlug, showOptions, page, limit);
  }
  /**
     * Get the rental reports
   * @param locationSlug - The location slug
   * @param searchDto - The search dto
     * @returns The rental reports
     */

  async getRentalReport(
    locationSlug: string,
    showOptions?: string,
    page = 1,
    limit = 20
  ) {
    const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
    if (!location) {
      return { body: [], pagination: { page, limit, total: 0, totalPages: 1 } };
    }

    // Base query with joins to mirror legacy display (customer and student names)
    const qb = this.equipmentRentalRepository
      .createQueryBuilder('equipmentRental')
      .select([
        'equipmentRental.id as id',
        'equipmentRental.studentId as studentId',
        'equipmentRental.customerId as customerId',
        'equipmentRental.isReturned as isReturned',
        'equipmentRental.isOnGoing as isOnGoing',
        'equipmentRental.startDate as startDate',
        'equipmentRental.returnDate as returnDate',
        'equipmentRental.endDate as endDate',
        'equipmentRental.duration as duration',
        "CONCAT(COALESCE(up.firstname, ''), ' ', COALESCE(up.lastname, '')) as customerName",
        "CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) as studentName",
      ])
      .leftJoin('student', 's', 's.id = equipmentRental.studentId')
      .leftJoin('user', 'u', 'u.id = equipmentRental.customerId')
      .leftJoin('user_profile', 'up', 'up.user_id = u.id');

    // Map showOptions
    // 0: ongoing or returnDate > today
    // 1: not returned and returnDate < today
    // 2: returnDate between today and +15 days
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const plus15 = new Date(today);
    plus15.setDate(plus15.getDate() + 15);
    const plus15Str = plus15.toISOString().slice(0, 10);

    if (showOptions === '0') {
      // Ongoing or due in future (returnDate > today)
      qb.andWhere('(equipmentRental.isOnGoing = 1 OR (equipmentRental.returnDate IS NOT NULL AND equipmentRental.returnDate > :today))', { today: todayStr });
    } else if (showOptions === '1') {
      // Not returned and overdue (returnDate < today)
      qb.andWhere('(equipmentRental.isReturned = 0 AND equipmentRental.returnDate IS NOT NULL AND equipmentRental.returnDate < :today)', { today: todayStr });
    } else if (showOptions === '2') {
      // Returning within next 15 days
      qb.andWhere('(equipmentRental.returnDate IS NOT NULL AND DATE(equipmentRental.returnDate) BETWEEN :start AND :end)', { start: todayStr, end: plus15Str });
    } // else: no extra filters 

    qb.orderBy('equipmentRental.id', 'ASC');

    // When no showOptions provided, return all . Ensure no hidden date filters
    // are applied implicitly. Only apply date filters if explicitly specified via future enhancement.

    const total = await qb.getCount();
    const rows = await qb.offset((page - 1) * limit).limit(limit).getRawMany();

    const toDate = (d?: any) => (d ? new Date(d) : null);
    const rentalData = rows.map((r: any) => {
      const start = toDate(r.startDate);
      const ret = toDate(r.returnDate);
      const end = toDate(r.endDate);
      const rentalTerm = Number(r.isOnGoing) === 1 ? 'On-going' : (r.duration ? `${Number(r.duration)} Month${Number(r.duration) > 1 ? 's' : ''}` : '');
      const equipmentReturned = Number(r.isReturned) === 1 ? 'Yes' : 'No';
      const equipmentReturnedDate = Number(r.isReturned) === 1 && end ? formatLegacyDate(end) : '';
    return { 
        id: String(r.id),
        customer: (r.customerName || '').trim(),
        student: (r.studentName || '').trim(),
        startDate: start ? formatLegacyDate(start) : '',
        returnDate: ret ? formatLegacyDate(ret) : '',
        rentalTerm,
        equipmentReturned,
        equipmentReturnedDate: end && Number(r.isReturned) === 1 ? formatLegacyDate(end) : '',
      };
    });

    return {
      body: rentalData,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}




