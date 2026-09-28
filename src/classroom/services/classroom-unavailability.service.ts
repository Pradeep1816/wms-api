import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassroomRepository } from '../repositories/classroom.repository';
import { ClassroomUnavailabilityRepository } from '../repositories/classroom-unavailability.repository';
import { CreateClassroomUnavailabilityDto } from '../dto/create-classroom-unavailability.dto';
import { UpdateClassroomUnavailabilityDto } from '../dto/update-classroom-unavailability.dto';
import { formatDate, convertToESTDate } from 'src/utils/date-utils';

const PAST_DATES_MSG = 'Unavailability cannot be set for past dates';



@Injectable()
export class ClassroomUnavailabilityService {
  constructor(
    private readonly classroomRepository: ClassroomRepository,
    private readonly unavailabilityRepository: ClassroomUnavailabilityRepository,
  ) {}

  private ensureNotPastDates(fromDateStr: string, toDateStr: string): void {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (fromDateStr < todayStr || toDateStr < todayStr) {
      throw new BadRequestException(PAST_DATES_MSG);
    }
  }

  async getUnavailabilities(classroomId: number, locationId: number) {
    const classroom = await this.classroomRepository.getClassroomByIdAndLocation(
      classroomId,
      locationId,
    );
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    const items = await this.unavailabilityRepository.findByClassroomId(classroomId);
    return items.map((row) => ({
      id: row.id,
      classroomId: row.classroomId,
      fromDate: formatDate(row.fromDate),
      toDate: formatDate(row.toDate),
      reason: row.reason ?? undefined,
    }));
  }

  async createUnavailability(
    classroomId: number,
    locationId: number,
    dto: CreateClassroomUnavailabilityDto,
  ) {
    const classroom = await this.classroomRepository.getClassroomByIdAndLocation(
      classroomId,
      locationId,
    );
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    this.ensureNotPastDates(dto.fromDate, dto.toDate);
    const fromDate = convertToESTDate(dto.fromDate);
    const toDate = convertToESTDate(dto.toDate);
    if (fromDate > toDate) {
      throw new BadRequestException('fromDate must be before or equal to toDate');
    }
    const created = await this.unavailabilityRepository.create({
      classroomId,
      fromDate,
      toDate,
      reason: dto.reason ?? undefined,
    });
    return {
      id: created.id,
      classroomId: created.classroomId,
      fromDate: formatDate(created.fromDate),
      toDate: formatDate(created.toDate),
      reason: created.reason ?? undefined,
    };
  }

  async updateUnavailability(
    id: number,
    classroomId: number,
    locationId: number,
    dto: UpdateClassroomUnavailabilityDto,
  ) {
    // check if classroom exists
    const classroom = await this.classroomRepository.getClassroomByIdAndLocation(
      classroomId,
      locationId,
    );

    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    // check if unavailability exists
    const existing = await this.unavailabilityRepository.findOneByIdAndClassroom(
      id,
      classroomId,
    );
    if (!existing) {
      throw new NotFoundException('Classroom unavailability not found');
    }
    const fromDateStr =
      dto.fromDate ?? (existing.fromDate as Date).toISOString().slice(0, 10);
    const toDateStr =
      dto.toDate ?? (existing.toDate as Date).toISOString().slice(0, 10);
    this.ensureNotPastDates(fromDateStr, toDateStr);
    const fromDate = dto.fromDate
      ? convertToESTDate(dto.fromDate)
      : existing.fromDate;
    const toDate = dto.toDate
      ? convertToESTDate(dto.toDate)
      : existing.toDate;
    if (fromDate > toDate) {
      throw new BadRequestException('fromDate must be before or equal to toDate');
    }
    existing.fromDate = fromDate;
    existing.toDate = toDate;
    if (dto.reason !== undefined) existing.reason = dto.reason ?? null;
    // update unavailability
    await this.unavailabilityRepository.save(existing);
    // return updated unavailability
    return {
      id: existing.id,
      classroomId: existing.classroomId,
      fromDate: formatDate(existing.fromDate),
      toDate: formatDate(existing.toDate),
      reason: existing.reason ?? undefined,
    };
  }

  async deleteUnavailability(
    id: number,
    classroomId: number,
    locationId: number,
  ) {
    const classroom = await this.classroomRepository.getClassroomByIdAndLocation(
      classroomId,
      locationId,
    );
    // check if classroom exists
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    // check if unavailability exists
    const existing = await this.unavailabilityRepository.findOneByIdAndClassroom(
      id,
      classroomId,
    );
    // check if unavailability exists
    if (!existing) {
      throw new NotFoundException('Classroom unavailability not found');
    }
    // delete unavailability
    await this.unavailabilityRepository.deleteByIdAndClassroom(id, classroomId);
    return { id };
  }
}
