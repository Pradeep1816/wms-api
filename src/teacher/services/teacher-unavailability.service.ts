import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TeacherUnavailabilityResponseDto } from '../dto/teacher-unavailability-response.dto';
import { TeacherUnavailabilityRepository } from '../repositories/teacher-unavailability.repository';
import { TeacherUnavailabilityTransformationService } from './transformations/teacher-unavailability-transformation.service';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { TeacherUnavailabilityRequestDto } from '../dto/teacher-unavailability-request.dto';
import { parseDateAsUTC } from 'src/utils/date-utils';

type UnavailabilityValidationErrors = Record<string, string[]>;
const FROM_FIELD = 'teacherunavailability-fromdatetime';
const TO_FIELD = 'teacherunavailability-todatetime';
const OVERLAP_ERROR = 'Teacher unavailability is overlapped';
const RANGE_ERROR = 'Enrolment end date must be greater than or equal to start date';

@Injectable()
export class TeacherUnavailabilityService {
  constructor(
    private readonly teacherUnavailabilityRepository: TeacherUnavailabilityRepository,
    private readonly transformationService: TeacherUnavailabilityTransformationService,
    private readonly validationService: CustomerValidationService,
  ) {}

  private async ensureTeacherExists(
    teacherId: number,
    locationId: number,
    locationSlug: string,
  ): Promise<void> {
    const isExists = await this.validationService.validateCustomerExists(
      teacherId,
      locationId,
    );
    if (!isExists) {
      throw new BadRequestException(
        `Teacher with id: ${teacherId} not found in location ${locationSlug}`,
      );
    }
  }

  private parseDateTime(dateTime: string): Date | null {
    const normalized = String(dateTime ?? '').replace(/\+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    try {
      return parseDateAsUTC(normalized);
    } catch {
      return null;
    }
  }

  private addError(
    errors: UnavailabilityValidationErrors,
    field: string,
    message: string,
  ): void {
    if (!errors[field]) {
      errors[field] = [];
    }
    errors[field].push(message);
  }

  private firstValidationError(errors: UnavailabilityValidationErrors): string {
    const fields = Object.keys(errors);
    if (fields.length === 0) {
      return 'Validation failed';
    }

    const firstFieldErrors = errors[fields[0]];
    if (!firstFieldErrors || firstFieldErrors.length === 0) {
      return 'Validation failed';
    }

    return firstFieldErrors[0];
  }

  private async validateAndResolveDateRange(
    teacherId: number,
    dto: TeacherUnavailabilityRequestDto,
    unavailabilityId?: number,
  ): Promise<{
    fromDateTime: Date | null;
    toDateTime: Date | null;
    errors: UnavailabilityValidationErrors;
  }> {
    const errors: UnavailabilityValidationErrors = {};
    const fromDateTime = this.parseDateTime(dto.fromDateTime);
    const toDateTime = this.parseDateTime(dto.toDateTime);

    if (!fromDateTime) {
      this.addError(errors, FROM_FIELD, 'From Date Time is invalid');
    }

    if (!toDateTime) {
      this.addError(errors, TO_FIELD, 'To Date Time is invalid');
    }

    if (fromDateTime && toDateTime && fromDateTime > toDateTime) {
      this.addError(errors, TO_FIELD, RANGE_ERROR);
    }

    if (
      fromDateTime &&
      toDateTime &&
      !errors[FROM_FIELD] &&
      !errors[TO_FIELD]
    ) {
      const hasOverlap =
        await this.teacherUnavailabilityRepository.hasOverlappingUnavailability(
          teacherId,
          fromDateTime,
          toDateTime,
          unavailabilityId,
        );

      if (hasOverlap) {
        this.addError(errors, FROM_FIELD, OVERLAP_ERROR);
      }
    }

    return {
      fromDateTime,
      toDateTime,
      errors,
    };
  }

  async getTeacherUnavailability(
    teacherId: number,
    locationId: number,
    locationSlug: string,
  ): Promise<TeacherUnavailabilityResponseDto> {
    await this.ensureTeacherExists(teacherId, locationId, locationSlug);

    const unavailability = await this.teacherUnavailabilityRepository.findByTeacher(teacherId);

    return this.transformationService.transformToResponse(unavailability);
  }

  async validateTeacherUnavailability(
    teacherId: number,
    locationId: number,
    locationSlug: string,
    dto: TeacherUnavailabilityRequestDto,
    unavailabilityId?: number,
  ): Promise<UnavailabilityValidationErrors> {
    await this.ensureTeacherExists(teacherId, locationId, locationSlug);

    const { errors } = await this.validateAndResolveDateRange(
      teacherId,
      dto,
      unavailabilityId,
    );

    return errors;
  }

  async createTeacherUnavailability(
    teacherId: number,
    locationId: number,
    locationSlug: string,
    dto: TeacherUnavailabilityRequestDto,
    userId: number,
  ): Promise<{ id: number }> {
    await this.ensureTeacherExists(teacherId, locationId, locationSlug);

    const { fromDateTime, toDateTime, errors } =
      await this.validateAndResolveDateRange(teacherId, dto);

    if (Object.keys(errors).length > 0 || !fromDateTime || !toDateTime) {
      throw new BadRequestException(this.firstValidationError(errors));
    }

    const created =
      await this.teacherUnavailabilityRepository.createTeacherUnavailability(
        teacherId,
        fromDateTime,
        toDateTime,
        userId,
        dto.reason?.trim() || '',
      );

    return {
      id: created.id,
    };
  }

  async updateTeacherUnavailability(
    unavailabilityId: number,
    teacherId: number,
    locationId: number,
    locationSlug: string,
    dto: TeacherUnavailabilityRequestDto,
    userId: number,
  ): Promise<{id: number }> {
    await this.ensureTeacherExists(teacherId, locationId, locationSlug);

    const existing = await this.teacherUnavailabilityRepository.findByIdAndTeacher(
      unavailabilityId,
      teacherId,
    );

    if (!existing) {
      throw new NotFoundException(
        `Teacher unavailability with id ${unavailabilityId} not found`,
      );
    }

    const { fromDateTime, toDateTime, errors } =
      await this.validateAndResolveDateRange(teacherId, dto, unavailabilityId);

    if (Object.keys(errors).length > 0 || !fromDateTime || !toDateTime) {
      throw new BadRequestException(this.firstValidationError(errors));
    }

    const updated =
      await this.teacherUnavailabilityRepository.updateTeacherUnavailability(
        existing,
        fromDateTime,
        toDateTime,
        userId,
        dto.reason?.trim() || '',
      );

    return {
      id: updated.id,
    };
  }

  async deleteTeacherUnavailability(
    unavailabilityId: number,
    teacherId: number,
    locationId: number,
    locationSlug: string,
    userId: number,
  ): Promise<{ status: boolean }> {
    await this.ensureTeacherExists(teacherId, locationId, locationSlug);

    const existing = await this.teacherUnavailabilityRepository.findByIdAndTeacher(
      unavailabilityId,
      teacherId,
    );

    if (!existing) {
      throw new NotFoundException(
        `Teacher unavailability with id ${unavailabilityId} not found`,
      );
    }

    await this.teacherUnavailabilityRepository.softDeleteTeacherUnavailability(
      existing,
      userId,
    );

    return { status: true };
  }
}
