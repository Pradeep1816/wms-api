import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { TeacherInvoicedLessonsResponseDto } from '../dto/teacher-invoiced-lessons-response.dto';
import { TeacherInvoicedLessonsRepository } from '../repositories/teacher-invoiced-lessons.repository';
import { TeacherInvoicedLessonsTransformationService } from './transformations/teacher-invoiced-lessons-transformation.service';
import { LocationService } from '../../location/services/location.service';
import { plainToInstance } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';
import { TeacherCompensationAdjustmentService } from './teacher-compensation-adjustment.service';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class TeacherInvoicedLessonsService {
  constructor(
    private readonly repository: TeacherInvoicedLessonsRepository,
    private readonly transformationService: TeacherInvoicedLessonsTransformationService,
    private readonly locationService: LocationService,
    private readonly compensationAdjustmentService: TeacherCompensationAdjustmentService,
  ) {}

  async getTeacherInvoicedLessons(
    locationSlug: string,
    teacherId: number,
    fromDate: string,
    toDate: string,
    summaryOnly?: boolean,
  ): Promise<TeacherInvoicedLessonsResponseDto> {
    try {
      const locationId = await this.locationService.getLocationId(locationSlug);

      // Query matching legacy: InvoiceLineItem -> Invoice -> Lesson via InvoiceItemLesson
      // Legacy uses joinWith which is LEFT JOIN, and filters lesson.teacherId in the join condition
      const invoiceLineItems =
        await this.repository.findInvoicedLessonsByTeacher(
          teacherId,
          locationId,
          fromDate,
          toDate,
        );

      const transformedInvoicedLessons = plainToInstance(
        TeacherInvoicedLessonsResponseDto,
        this.transformationService.transformToResponse(
          invoiceLineItems,
          summaryOnly,
        ),
      );
      const actualHours = transformedInvoicedLessons.totalDuration || 0;
      const actualAmount = this.parseCurrency(
        transformedInvoicedLessons.totalCost,
      );
      const adjustments =
        await this.compensationAdjustmentService.getAppliedAdjustments({
          locationId,
          teacherId,
          documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
          startDate: fromDate,
          endDate: toDate,
          actualHours,
          actualAmount,
        });

      if (adjustments.length > 0) {
        const totalAdjustmentHours = adjustments.reduce(
          (total, adjustment) => total + adjustment.adjustmentHours,
          0,
        );
        const totalAdjustmentAmount = adjustments.reduce(
          (total, adjustment) => total + (adjustment.adjustmentAmount ?? 0),
          0,
        );

        transformedInvoicedLessons.totalDuration = RoundingUtils.roundDecimal(
          actualHours + totalAdjustmentHours,
          2,
        );

        if (
          adjustments.some((adjustment) => adjustment.adjustmentAmount != null)
        ) {
          transformedInvoicedLessons.totalCost = formatCurrency(
            RoundingUtils.roundDecimal(
              actualAmount + totalAdjustmentAmount,
              2,
            ),
          );
        }

        transformedInvoicedLessons.adjustments = adjustments.map(
          (adjustment) => ({
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
          }),
        );
      }

      return transformedInvoicedLessons;
    } catch (error) {
      console.error('Error in TeacherInvoicedLessonsService:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve teacher invoiced lessons',
      );
    }
  }

  /**
   * Lightweight yes/no used by the batch preflight: does the teacher have any
   * invoiced lessons in the range? Deliberately skips the transform, currency
   * formatting and compensation-adjustment work of getTeacherInvoicedLessons —
   * the batch preview only needs to know whether there is anything to invoice,
   * and it runs this once per candidate teacher.
   */
  async hasInvoicedLessons(
    locationId: number,
    teacherId: number,
    fromDate: string,
    toDate: string,
  ): Promise<boolean> {
    const invoiceLineItems =
      await this.repository.findInvoicedLessonsByTeacher(
        teacherId,
        locationId,
        fromDate,
        toDate,
      );

    return invoiceLineItems.length > 0;
  }

  private parseCurrency(value: string | null | undefined): number {
    return Number(String(value || '').replace(/[^0-9.-]+/g, '')) || 0;
  }

  redactFinancialFields(
    response: TeacherInvoicedLessonsResponseDto,
  ): TeacherInvoicedLessonsResponseDto {
    const body = (response.body || []) as unknown as Array<
      Record<string, unknown> & {
        lessons?: Array<Record<string, unknown>>;
      }
    >;
    const redactedBody = body.map((item) => {
      if (Array.isArray(item.lessons)) {
        return {
          ...item,
          totalCost: '',
          lessons: item.lessons.map((lesson) => ({
            ...lesson,
            rate: '',
            cost: '',
          })),
        };
      }

      return {
        ...item,
        cost: '',
      };
    }) as unknown as TeacherInvoicedLessonsResponseDto['body'];

    return {
      ...response,
      totalCost: '',
      body: redactedBody,
      adjustments: response.adjustments?.map((adjustment) => ({
        ...adjustment,
        hourlyRate: null,
        adjustmentAmount: null,
      })),
    };
  }
}
