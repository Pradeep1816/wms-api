import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TeacherCompensationAdjustmentQueryDto,
  UpsertTeacherCompensationAdjustmentDto,
} from '../dto/teacher-compensation-adjustment.dto';
import { TeacherCompensationAdjustment } from '../entities/teacher-compensation-adjustment.entity';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';
import { TeacherCompensationAdjustmentRepository } from '../repositories/teacher-compensation-adjustment.repository';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface AppliedTeacherCompensationAdjustment {
  id: number;
  documentType: TeacherDocumentSignatureRequestType;
  startDate: string;
  endDate: string;
  label: string;
  minimumHours: number;
  actualHours: number;
  adjustmentHours: number;
  hourlyRate: number | null;
  adjustmentAmount: number | null;
  note: string | null;
}

@Injectable()
export class TeacherCompensationAdjustmentService {
  constructor(
    private readonly repository: TeacherCompensationAdjustmentRepository,
  ) {}

  async getAdjustment(
    locationId: number,
    teacherId: number,
    query: TeacherCompensationAdjustmentQueryDto,
    options?: { includeHourlyRate?: boolean },
  ): Promise<{ body: TeacherCompensationAdjustmentResponseDto | null }> {
    this.assertValidDateRange(query.startDate, query.endDate);
    const adjustment = await this.repository.findActiveByRange({
      locationId,
      teacherId,
      documentType: query.documentType,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    return {
      body: adjustment
        ? this.toResponse(adjustment, options?.includeHourlyRate !== false)
        : null,
    };
  }

  async upsertAdjustment(
    locationId: number,
    teacherId: number,
    userId: number,
    dto: UpsertTeacherCompensationAdjustmentDto,
    options?: { canManageHourlyRate?: boolean },
  ): Promise<{ body: TeacherCompensationAdjustmentResponseDto }> {
    this.assertValidDateRange(dto.startDate, dto.endDate);
    const canManageHourlyRate = options?.canManageHourlyRate !== false;

    const adjustment = await this.repository.upsertRange({
      locationId,
      teacherId,
      documentType: dto.documentType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      minimumHours: dto.minimumHours,
      hourlyRate: canManageHourlyRate ? (dto.hourlyRate ?? null) : null,
      note: dto.note?.trim() || null,
      userId,
      preserveHourlyRate: !canManageHourlyRate,
    });

    return {
      body: this.toResponse(adjustment, canManageHourlyRate),
    };
  }

  async deleteAdjustment(
    locationId: number,
    teacherId: number,
    id: number,
    userId: number,
  ): Promise<{ body: { deleted: true } }> {
    const deleted = await this.repository.softDelete({
      id,
      locationId,
      teacherId,
      userId,
    });

    if (!deleted) {
      throw new NotFoundException('Compensation adjustment not found');
    }

    return {
      body: {
        deleted: true,
      },
    };
  }

  async getAppliedAdjustments(params: {
    locationId: number;
    teacherId: number;
    documentType: TeacherDocumentSignatureRequestType;
    startDate: string;
    endDate: string;
    actualHours: number;
    actualAmount?: number | null;
  }): Promise<AppliedTeacherCompensationAdjustment[]> {
    const adjustments = await this.repository.findActiveWithinRange(params);

    const actualHours = Number(params.actualHours || 0);

    return adjustments
      .map((adjustment) => this.toAppliedAdjustment(adjustment, actualHours))
      .filter(
        (adjustment): adjustment is AppliedTeacherCompensationAdjustment =>
          adjustment != null,
      );
  }

  private toAppliedAdjustment(
    adjustment: TeacherCompensationAdjustment,
    actualHours: number,
  ): AppliedTeacherCompensationAdjustment | null {
    const adjustmentHours = RoundingUtils.roundDecimal(
      Number(adjustment.minimumHours || 0),
      2,
    );

    if (adjustmentHours <= 0) {
      return null;
    }

    const hourlyRate =
      adjustment.hourlyRate == null ? null : Number(adjustment.hourlyRate);

    return {
      id: adjustment.id,
      documentType: adjustment.documentType,
      startDate: adjustment.startDate,
      endDate: adjustment.endDate,
      label: this.formatDateRangeLabel(
        adjustment.startDate,
        adjustment.endDate,
      ),
      minimumHours: adjustmentHours,
      actualHours: RoundingUtils.roundDecimal(Number(actualHours || 0), 2),
      adjustmentHours,
      hourlyRate,
      adjustmentAmount:
        hourlyRate == null
          ? null
          : RoundingUtils.roundDecimal(adjustmentHours * hourlyRate, 2),
      note: adjustment.note,
    };
  }

  private formatDateRangeLabel(startDate: string, endDate: string): string {
    return `${this.formatDateLabel(startDate)} - ${this.formatDateLabel(endDate)}`;
  }

  private formatDateLabel(value: string): string {
    const [year, month, day] = String(value).split('-').map(Number);

    if (!year || !month || !day) {
      return value;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  private assertValidDateRange(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new BadRequestException(
        'Start date must be before or equal to end date',
      );
    }
  }

  private toResponse(
    adjustment: TeacherCompensationAdjustment,
    includeHourlyRate = true,
  ): TeacherCompensationAdjustmentResponseDto {
    return {
      id: adjustment.id,
      documentType: adjustment.documentType,
      startDate: adjustment.startDate,
      endDate: adjustment.endDate,
      minimumHours: Number(adjustment.minimumHours),
      hourlyRate:
        includeHourlyRate && adjustment.hourlyRate != null
          ? Number(adjustment.hourlyRate)
          : null,
      note: adjustment.note,
      createdOn: adjustment.createdOn,
      updatedOn: adjustment.updatedOn,
    };
  }
}

export interface TeacherCompensationAdjustmentResponseDto {
  id: number;
  documentType: TeacherDocumentSignatureRequestType;
  startDate: string;
  endDate: string;
  minimumHours: number;
  hourlyRate: number | null;
  note: string | null;
  createdOn: Date;
  updatedOn: Date;
}
