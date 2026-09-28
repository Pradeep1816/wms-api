import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { TeacherTimeVoucherResponseDto } from '../dto/teacher-time-voucher-response.dto';
import { TeacherTimeVoucherRepository } from '../repositories/teacher-time-voucher.repository';
import { TeacherTimeVoucherTransformationService } from './transformations/teacher-time-voucher-transformation.service';
import { LocationService } from '../../location/services/location.service';
import { plainToInstance } from 'class-transformer';
import { formatDateToEasternString } from '../../utils/formatters';
import { formatDateYMD, parseDateFromIso } from '../../utils/date-utils';
import { TeacherCompensationAdjustmentService } from './teacher-compensation-adjustment.service';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';

@Injectable()
export class TeacherTimeVoucherService {
  constructor(
    private readonly repository: TeacherTimeVoucherRepository,
    private readonly transformationService: TeacherTimeVoucherTransformationService,
    private readonly locationService: LocationService,
    private readonly compensationAdjustmentService: TeacherCompensationAdjustmentService,
  ) {}

  async getTeacherTimeVoucher(
    locationSlug: string,
    teacherId: number,
    fromDate?: string,
    toDate?: string,
    summaryOnly?: boolean,
  ): Promise<TeacherTimeVoucherResponseDto> {
    try {
      const locationId = await this.locationService.getLocationId(locationSlug);
      const today = formatDateToEasternString();
      const normalizedFromDate = fromDate
        ? this.normalizeDateInput(fromDate)
        : undefined;
      const normalizedToDate = toDate
        ? this.normalizeDateInput(toDate)
        : undefined;

      let effectiveFromDate = normalizedFromDate ?? normalizedToDate ?? today;
      let effectiveToDate = normalizedToDate ?? normalizedFromDate ?? today;

      // Defensive normalization for inverted ranges.
      if (effectiveFromDate > effectiveToDate) {
        [effectiveFromDate, effectiveToDate] = [
          effectiveToDate,
          effectiveFromDate,
        ];
      }

      const lessons = await this.repository.findTimeVoucherLessonsByTeacher(
        teacherId,
        locationId,
        effectiveFromDate,
        effectiveToDate,
      );

      const transformedLessons = plainToInstance(
        TeacherTimeVoucherResponseDto,
        this.transformationService.transformToResponse(lessons, summaryOnly),
      );
      const actualHours = transformedLessons.footer?.totalDuration || 0;
      const adjustments =
        await this.compensationAdjustmentService.getAppliedAdjustments({
          locationId,
          teacherId,
          documentType: TeacherDocumentSignatureRequestType.TIME_VOUCHER,
          startDate: effectiveFromDate,
          endDate: effectiveToDate,
          actualHours,
        });

      if (adjustments.length > 0) {
        const totalAdjustmentHours = adjustments.reduce(
          (total, adjustment) => total + adjustment.adjustmentHours,
          0,
        );

        transformedLessons.footer.totalDuration = Number(
          (actualHours + totalAdjustmentHours).toFixed(2),
        );
        transformedLessons.adjustments = adjustments.map((adjustment) => ({
          id: adjustment.id,
          documentType: adjustment.documentType,
          startDate: adjustment.startDate,
          endDate: adjustment.endDate,
          label: adjustment.label,
          minimumHours: adjustment.minimumHours,
          actualHours: adjustment.actualHours,
          adjustmentHours: adjustment.adjustmentHours,
          hourlyRate: adjustment.hourlyRate,
          adjustmentAmount: adjustment.adjustmentAmount,
          note: adjustment.note,
        }));
      }

      return transformedLessons;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error in TeacherTimeVoucherService:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve teacher time voucher',
      );
    }
  }

  /**
   * Lightweight yes/no used by the batch preflight: does the teacher have any
   * time-voucher lessons (confirmed, scheduled/rescheduled) in the range?
   * Deliberately skips the transform and compensation-adjustment work of
   * getTeacherTimeVoucher — the batch preview only needs to know whether there
   * is anything to send, and it runs this once per candidate teacher.
   */
  async hasTimeVoucherLessons(
    locationId: number,
    teacherId: number,
    fromDate: string,
    toDate: string,
  ): Promise<boolean> {
    const lessons = await this.repository.findTimeVoucherLessonsByTeacher(
      teacherId,
      locationId,
      fromDate,
      toDate,
    );

    return lessons.length > 0;
  }

  private normalizeDateInput(rawValue: string): string {
    const normalizedValue = String(rawValue)
      .replace(/\+/g, ' ')
      // Support legacy "M d,Y" and "M dd,Y" by inserting a space after comma.
      .replace(/,(\d{4})$/, ', $1')
      .trim();

    const parsedDate = parseDateFromIso(normalizedValue);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`Invalid date format: ${rawValue}`);
    }

    return formatDateYMD(parsedDate);
  }
}
