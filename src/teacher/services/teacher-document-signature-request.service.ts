import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { LocationRepository } from '../../location/repositories/location.repository';
import { LocationService } from '../../location/services/location.service';
import { MailerService } from '../../shared/services/mailer.service';
import { resolvePortalUserIdByLocation } from '../../shared/services/portal-user.helper';
import {
  CreateTeacherDocumentSignatureRequestDto,
  RejectTeacherDocumentSignatureRequestDto,
  SignTeacherDocumentSignatureRequestDto,
  TeacherDocumentAnnualInvoiceHistoryQueryDto,
  TeacherDocumentSignatureTeacherStatusFilter,
  TeacherDocumentSignatureTrackingQueryDto,
  TeacherInvoicedLessonsBatchPreviewQueryDto,
  VoidTeacherDocumentSignatureRequestDto,
} from '../dto/teacher-document-signature-request.dto';
import {
  TeacherDocumentSignatureRequest,
  TeacherDocumentSignatureRequestStatus,
  TeacherDocumentSignatureRequestType,
} from '../entities/teacher-document-signature-request.entity';
import { TeacherDocumentSignatureRequestRepository } from '../repositories/teacher-document-signature-request.repository';
import { TeacherInvoicedLessonsService } from './teacher-invoiced-lessons.service';
import { TeacherTimeVoucherService } from './teacher-time-voucher.service';
import { TeacherDocumentDisclosureService } from './teacher-document-disclosure.service';
import { TeacherService } from './teacher.service';
import { TeacherDocumentSignatureTransformationService } from './transformations/teacher-document-signature-transformation.service';
import { TeacherDocumentSignatureRejectionResponseDto } from '../dto/teacher-document-signature-rejection-response.dto';
import { string } from 'fast-check';

export interface SignatureRequestResponse {
  body: TeacherDocumentSignatureRequestResponseDto;
  created: boolean;
  notification?: TeacherSignatureNotificationResponse;
}

export interface SignedTeacherDocumentResponse {
  body: TeacherDocumentSignatureRequestResponseDto;
  notification?: TeacherSignatureNotificationResponse;
}

export interface RejectedTeacherDocumentResponse {
  body: TeacherDocumentSignatureRejectionResponseDto;
  notification?: TeacherSignatureNotificationResponse;
}

export interface TeacherDocumentSignatureRequestResponseDto {
  id: number;
  teacherId: number;
  documentType: string;
  startDate: string;
  endDate: string;
  summaryOnly: boolean;
  status: TeacherDocumentSignatureRequestStatus;
  requestedAt: Date | null;
  lastRemindedAt: Date | null;
  signedAt: Date | null;
  signedSignerName: string | null;
  signedSignatureDataUrl: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  disclosureSnapshot: string | null;
  documentDataSnapshot: unknown;
}

export interface TeacherDocumentSignatureTrackingRowDto {
  teacherId: number;
  teacherName: string;
  teacherBusinessName: string | null;
  documentType: TeacherDocumentSignatureRequestType;
  startDate: string;
  endDate: string;
  summaryOnly: boolean;
  status: TeacherDocumentSignatureRequestStatus | 'not_sent';
  request: TeacherDocumentSignatureRequestResponseDto | null;
  reason: string | null;
}

export interface TeacherDocumentAnnualInvoiceHistoryRowDto extends TeacherDocumentSignatureTrackingRowDto {
  month: number;
  monthLabel: string;
}

export type TeacherInvoicedLessonsBatchSkipReason =
  | 'already_signed'
  | 'already_pending'
  | 'no_email'
  | 'no_lessons';

export interface TeacherInvoicedLessonsBatchPreviewRowDto {
  teacherId: number;
  teacherName: string;
  teacherBusinessName: string | null;
  status: TeacherDocumentSignatureRequestStatus | 'not_sent';
  // Whether the batch would send this instructor a request. When false,
  // skipReason says why so the confirmation screen can explain each skip.
  eligible: boolean;
  skipReason: TeacherInvoicedLessonsBatchSkipReason | null;
}

export interface TeacherInvoicedLessonsBatchPreviewDto {
  startDate: string;
  endDate: string;
  summaryOnly: boolean;
  totalCount: number;
  eligibleCount: number;
  skippedCount: number;
  rows: TeacherInvoicedLessonsBatchPreviewRowDto[];
}

// Everything the client needs to render the exact document a teacher would be
// sent for a period, without first creating a signature request. Mirrors the
// shape of the saved snapshot so the same print pipeline can render it.
export interface TeacherDocumentPreviewDto {
  documentType: string;
  startDate: string;
  endDate: string;
  summaryOnly: boolean;
  documentData: unknown;
  locationDetails: unknown;
  disclosureSnapshot: string | null;
}

interface TeacherSignatureNotificationContext {
  fromEmail: string;
  locationName: string;
  locationSlug: string;
  teacherEmail: string;
  teacherName: string;
}

interface TeacherSignatureCompletedNotificationContext {
  fromEmail: string;
  locationName: string;
  locationSlug: string;
  teacherName: string;
}

interface TeacherSignatureRejectedNotificationContext {
  fromEmail: string;
  locationName: string;
  locationSlug: string;
  requesterEmail: string;
  teacherEmail: string | null;
  teacherName: string;
}

interface TeacherSignatureLocationContext {
  email?: string | null;
  name?: string | null;
  slug: string;
}

interface TeacherSignatureNotificationResponse {
  emailSent: boolean;
  message?: string;
}

@Injectable()
export class TeacherDocumentSignatureRequestService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    private readonly requestRepository: TeacherDocumentSignatureRequestRepository,
    private readonly timeVoucherService: TeacherTimeVoucherService,
    private readonly invoicedLessonsService: TeacherInvoicedLessonsService,
    private readonly locationService: LocationService,
    private readonly locationRepository: LocationRepository,
    private readonly mailerService: MailerService,
    private readonly disclosureService: TeacherDocumentDisclosureService,
    private readonly teacherService: TeacherService,
    private readonly transformationService: TeacherDocumentSignatureTransformationService,
  ) {}

  async requestSignature(
    locationSlug: string,
    locationId: number,
    teacherId: number,
    requestedByUserId: number,
    dto: CreateTeacherDocumentSignatureRequestDto,
  ): Promise<SignatureRequestResponse> {
    await this.assertTeacherInLocation(locationId, teacherId);

    if (dto.startDate > dto.endDate) {
      throw new BadRequestException(
        'Start date must be before or equal to end date',
      );
    }

    const summaryOnly = dto.summaryOnly === true;
    const existing = await this.requestRepository.findActiveRequest({
      locationId,
      teacherId,
      documentType: dto.documentType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      summaryOnly,
    });

    // A cancelled or voided document no longer holds the period, so a fresh
    // request can be raised for it without forcing.
    const isSupersededStatus =
      existing?.status === TeacherDocumentSignatureRequestStatus.CANCELLED ||
      existing?.status === TeacherDocumentSignatureRequestStatus.VOID;

    if (
      existing &&
      !isSupersededStatus &&
      !(
        dto.forceCreate === true &&
        existing.status === TeacherDocumentSignatureRequestStatus.SIGNED
      )
    ) {
      return {
        body: this.toResponse(existing),
        created: false,
      };
    }

    if (dto.forceCreate !== true) {
      const signedRequest =
        await this.requestRepository.findLatestSignedRequestWithSummaryFallback(
          {
            locationId,
            teacherId,
            documentType: dto.documentType,
            startDate: dto.startDate,
            endDate: dto.endDate,
            summaryOnly,
          },
        );

      if (signedRequest) {
        return {
          body: this.toResponse(signedRequest),
          created: false,
        };
      }
    }

    const [disclosureSnapshot, documentDataSnapshot] = await Promise.all([
      this.disclosureService.getDisclosureContent(dto.documentType),
      this.buildDocumentDataSnapshot(locationSlug, teacherId, dto),
    ]);

    const createdRequest = await this.requestRepository.createRequest({
      locationId,
      teacherId,
      documentType: dto.documentType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      summaryOnly,
      requestedByUserId,
      disclosureSnapshot,
      documentDataSnapshot: JSON.stringify(documentDataSnapshot),
    });

    const notification = await this.trySendSignatureRequestEmail(
      locationId,
      teacherId,
      createdRequest,
    );

    return {
      body: this.toResponse(createdRequest),
      created: true,
      notification,
    };
  }

  /**
   * Voids a document so it no longer counts as the record for its period.
   * The row is kept (never soft-deleted) because voided documents still have
   * to be produceable in an audit — voiding is a status change, not a delete.
   */
  async voidSignatureRequest(
    locationId: number,
    requestId: number,
    voidedByUserId: number,
    dto: VoidTeacherDocumentSignatureRequestDto,
  ): Promise<{ body: TeacherDocumentSignatureRequestResponseDto }> {
    const request = await this.requestRepository.findByIdForLocation(
      requestId,
      locationId,
    );

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.VOID) {
      throw new BadRequestException('This document is already void.');
    }

    const reason = dto.reason?.trim();

    if (!reason) {
      throw new BadRequestException('A reason is required to void a document.');
    }

    const voidedRequest = await this.requestRepository.markVoided(request, {
      voidedByUserId,
      reason,
    });

    return {
      body: this.toResponse(voidedRequest),
    };
  }

  /**
   * Re-sends the notification for a request the instructor has not signed yet.
   * Deliberately separate from `requestSignature`: no new row is created, so
   * Signature Tracking keeps showing one entry per document with its original
   * requested date intact.
   */
  async resendSignatureReminder(
    locationId: number,
    requestId: number,
  ): Promise<SignedTeacherDocumentResponse> {
    const request = await this.requestRepository.findByIdForLocation(
      requestId,
      locationId,
    );

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.SIGNED) {
      throw new BadRequestException(
        'This document has already been signed, so no reminder is needed.',
      );
    }

    if (request.status !== TeacherDocumentSignatureRequestStatus.PENDING) {
      throw new BadRequestException(
        'Only a pending signature request can be resent.',
      );
    }

    const notification = await this.trySendSignatureRequestEmail(
      locationId,
      request.teacherId,
      request,
    );

    // Only stamp the reminder once the email actually went out, so a failed
    // send does not leave the tracking screen claiming the teacher was chased.
    const updatedRequest = notification.emailSent
      ? await this.requestRepository.markReminded(request)
      : request;

    return {
      body: this.toResponse(updatedRequest),
      notification,
    };
  }

  async getTeacherRequests(
    locationId: number,
    teacherId: number,
  ): Promise<{ body: TeacherDocumentSignatureRequestResponseDto[] }> {
    const effectiveTeacherId = await this.resolvePortalTeacherIdForLocation(
      teacherId,
      locationId,
    );
    const requests = await this.requestRepository.findForTeacher(
      locationId,
      effectiveTeacherId,
    );

    return {
      body: requests.map((request) => this.toResponse(request)),
    };
  }

  async getTeacherRequestPreview(
    locationSlug: string,
    locationId: number,
    teacherId: number,
    requestId: number,
  ): Promise<{
    body: {
      request: TeacherDocumentSignatureRequestResponseDto;
      documentData: unknown;
      locationDetails: unknown;
    };
  }> {
    const effectiveTeacherId = await this.resolvePortalTeacherIdForLocation(
      teacherId,
      locationId,
    );
    const request = await this.requestRepository.findByIdForTeacher(
      requestId,
      locationId,
      effectiveTeacherId,
    );

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    const documentData =
      this.parseDocumentDataSnapshot(request.documentDataSnapshot) ??
      (await this.buildDocumentDataSnapshot(locationSlug, effectiveTeacherId, {
        documentType: request.documentType,
        startDate: request.startDate,
        endDate: request.endDate,
        summaryOnly: request.summaryOnly,
      }));

    const locationDetails =
      await this.locationService.getLocationDetailsBySlug(locationSlug);

    return {
      body: {
        request: this.toResponse(request),
        documentData,
        locationDetails,
      },
    };
  }

  async getAdminSignatureTrackingReport(
    locationId: number,
    query: TeacherDocumentSignatureTrackingQueryDto,
  ): Promise<{ body: TeacherDocumentSignatureTrackingRowDto[] }> {
    if (query.startDate > query.endDate) {
      throw new BadRequestException(
        'Start date must be before or equal to end date',
      );
    }

    const [teachers, requests] = await Promise.all([
      this.teacherService.findTeachersByLocation(
        locationId,
        query.teacherStatus ||
          TeacherDocumentSignatureTeacherStatusFilter.ACTIVE,
      ),
      this.requestRepository.findLatestByRangeForTracking({
        locationId,
        documentType: query.documentType,
        startDate: query.startDate,
        endDate: query.endDate,
      }),
    ]);

    const requestTeacherReportTypes = new Set<string>();
    requests.forEach((request) => {
      const requestSummaryOnly = Number(request.summaryOnly) === 1;
      requestTeacherReportTypes.add(
        this.getTrackingRequestKey(request.teacherId, requestSummaryOnly),
      );
    });
    const teachersById = new Map(
      teachers.map((teacher) => [teacher.id, teacher]),
    );
    const rows: TeacherDocumentSignatureTrackingRowDto[] = teachers.flatMap(
      (teacher) => {
        return [false, true].flatMap((summaryOnly) => {
          const hasMatchingRequest = requestTeacherReportTypes.has(
            this.getTrackingRequestKey(teacher.id, summaryOnly),
          );

          return hasMatchingRequest
            ? []
            : [
                {
                  teacherId: teacher.id,
                  teacherName: teacher.name,
                  teacherBusinessName: teacher.businessName || null,
                  documentType: query.documentType,
                  startDate: query.startDate,
                  endDate: query.endDate,
                  summaryOnly,
                  status: 'not_sent' as const,
                  request: null,
                  reason: null,
                },
              ];
        });
      },
    );
    requests.forEach((request) => {
      const teacher = teachersById.get(request.teacherId);
      const requestSummaryOnly = Number(request.summaryOnly) === 1;

      if (!teacher) {
        return;
      }

      rows.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherBusinessName: teacher.businessName || null,
        documentType: request.documentType,
        startDate: request.startDate,
        endDate: request.endDate,
        summaryOnly: requestSummaryOnly,
        status: request.status,
        request: this.toResponse(request),
        reason: request.rejection_reason
      });
    });

    const requestedStatus = query.status ? `${query.status}` : null;
    const filteredRows = requestedStatus
      ? rows.filter((row) => `${row.status}` === requestedStatus)
      : rows;

    return {
      body: filteredRows,
    };
  }

  /**
   * Classifies every instructor at a location for a batch Invoiced Lessons send
   * over one period. This is advisory only — it powers the confirmation screen.
   * The authoritative skip logic still runs per instructor when the browser
   * calls the normal per-instructor send endpoint, so a stale "eligible" here
   * simply becomes a "skipped, already signed/pending" in the send result.
   */
  async previewInvoicedLessonsBatch(
    locationId: number,
    query: TeacherInvoicedLessonsBatchPreviewQueryDto,
  ): Promise<{ body: TeacherInvoicedLessonsBatchPreviewDto }> {
    return this.previewDocumentBatch(
      locationId,
      TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
      query,
    );
  }

  /**
   * Time Voucher counterpart of previewInvoicedLessonsBatch. Same advisory
   * classification, keyed off scheduled/rescheduled lessons instead of invoiced
   * ones — the authoritative per-instructor send still runs afterwards.
   */
  async previewTimeVoucherBatch(
    locationId: number,
    query: TeacherInvoicedLessonsBatchPreviewQueryDto,
  ): Promise<{ body: TeacherInvoicedLessonsBatchPreviewDto }> {
    return this.previewDocumentBatch(
      locationId,
      TeacherDocumentSignatureRequestType.TIME_VOUCHER,
      query,
    );
  }

  // Shared batch classification for both document types. The only per-type
  // difference is which "does this instructor have anything to send?" check
  // runs, so that is dispatched on documentType and everything else is common.
  private async previewDocumentBatch(
    locationId: number,
    documentType: TeacherDocumentSignatureRequestType,
    query: TeacherInvoicedLessonsBatchPreviewQueryDto,
  ): Promise<{ body: TeacherInvoicedLessonsBatchPreviewDto }> {
    if (query.startDate > query.endDate) {
      throw new BadRequestException(
        'Start date must be before or equal to end date',
      );
    }

    const summaryOnly = query.summaryOnly === true;

    const [teachers, exactRequests] = await Promise.all([
      this.teacherService.findTeachersByLocation(
        locationId,
        query.teacherStatus ||
          TeacherDocumentSignatureTeacherStatusFilter.ACTIVE,
      ),
      // Matched on the exact period in SQL — `date` columns come back as Date
      // objects, so this cannot be filtered by string comparison in JS.
      this.requestRepository.findByExactPeriodForLocation({
        locationId,
        documentType,
        startDate: query.startDate,
        endDate: query.endDate,
      }),
    ]);

    // A signed request for either report type counts as already handled (the
    // real send falls back across summaryOnly), whereas a pending request only
    // blocks the matching report type. summaryOnly is normalised with Boolean()
    // because the tinyint column can arrive as 0/1 rather than false/true.
    const signedTeacherIds = new Set(
      exactRequests
        .filter(
          (request) =>
            request.status === TeacherDocumentSignatureRequestStatus.SIGNED,
        )
        .map((request) => request.teacherId),
    );
    const pendingTeacherIds = new Set(
      exactRequests
        .filter(
          (request) =>
            Boolean(request.summaryOnly) === summaryOnly &&
            request.status === TeacherDocumentSignatureRequestStatus.PENDING,
        )
        .map((request) => request.teacherId),
    );

    // Instructors not already signed/pending are candidates; only they need the
    // more expensive email + lessons lookups.
    const candidates = teachers.filter(
      (teacher) =>
        !signedTeacherIds.has(teacher.id) && !pendingTeacherIds.has(teacher.id),
    );
    const candidateIds = candidates.map((teacher) => teacher.id);

    const emailTeacherIds =
      await this.findTeacherIdsWithPrimaryEmail(candidateIds);

    // Only instructors with an email on file could actually be sent to, so the
    // heavier per-teacher lessons lookup is limited to them. It runs in bounded
    // chunks rather than one Promise.all over every candidate, so a large
    // location (say 100 teachers) never fires 100 queries at the database at
    // once — it stays gentle regardless of how many teachers a location has.
    const lessonCandidates = candidates.filter((teacher) =>
      emailTeacherIds.has(teacher.id),
    );
    const hasLessonsByTeacherId = new Map<number, boolean>();
    const LESSON_LOOKUP_CONCURRENCY = 8;
    for (
      let index = 0;
      index < lessonCandidates.length;
      index += LESSON_LOOKUP_CONCURRENCY
    ) {
      const chunk = lessonCandidates.slice(
        index,
        index + LESSON_LOOKUP_CONCURRENCY,
      );
      const flags = await Promise.all(
        chunk.map((teacher) =>
          documentType === TeacherDocumentSignatureRequestType.TIME_VOUCHER
            ? this.timeVoucherService.hasTimeVoucherLessons(
                locationId,
                teacher.id,
                query.startDate,
                query.endDate,
              )
            : this.invoicedLessonsService.hasInvoicedLessons(
                locationId,
                teacher.id,
                query.startDate,
                query.endDate,
              ),
        ),
      );
      chunk.forEach((teacher, chunkIndex) =>
        hasLessonsByTeacherId.set(teacher.id, flags[chunkIndex]),
      );
    }

    const rows: TeacherInvoicedLessonsBatchPreviewRowDto[] = teachers
      .map((teacher) => {
        const base = {
          teacherId: teacher.id,
          teacherName: teacher.name,
          teacherBusinessName: teacher.businessName || null,
        };

        if (signedTeacherIds.has(teacher.id)) {
          return {
            ...base,
            status: TeacherDocumentSignatureRequestStatus.SIGNED,
            eligible: false,
            skipReason: 'already_signed' as const,
          };
        }

        if (pendingTeacherIds.has(teacher.id)) {
          return {
            ...base,
            status: TeacherDocumentSignatureRequestStatus.PENDING,
            eligible: false,
            skipReason: 'already_pending' as const,
          };
        }

        if (!emailTeacherIds.has(teacher.id)) {
          return {
            ...base,
            status: 'not_sent' as const,
            eligible: false,
            skipReason: 'no_email' as const,
          };
        }

        if (!hasLessonsByTeacherId.get(teacher.id)) {
          return {
            ...base,
            status: 'not_sent' as const,
            eligible: false,
            skipReason: 'no_lessons' as const,
          };
        }

        return {
          ...base,
          status: 'not_sent' as const,
          eligible: true,
          skipReason: null,
        };
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    const eligibleCount = rows.filter((row) => row.eligible).length;

    return {
      body: {
        startDate: query.startDate,
        endDate: query.endDate,
        summaryOnly,
        totalCount: rows.length,
        eligibleCount,
        skippedCount: rows.length - eligibleCount,
        rows,
      },
    };
  }

  async getAdminAnnualInvoiceHistory(
    locationId: number,
    query: TeacherDocumentAnnualInvoiceHistoryQueryDto,
  ): Promise<{ body: TeacherDocumentAnnualInvoiceHistoryRowDto[] }> {
    const periods = this.buildMonthlyPeriodsForYear(query.year);
    const yearStart = this.formatYearMonthDay(query.year, 1, 1);
    const yearEnd = this.formatYearMonthDay(query.year, 12, 31);

    const [allTeachers, requests] = await Promise.all([
      this.teacherService.findTeachersByLocation(
        locationId,
        query.teacherStatus ||
          TeacherDocumentSignatureTeacherStatusFilter.ACTIVE,
      ),
      this.requestRepository.findAnnualInvoiceHistoryRequests({
        locationId,
        startDate: yearStart,
        endDate: yearEnd,
        teacherId: query.teacherId,
      }),
    ]);

    const teachers = query.teacherId
      ? allTeachers.filter((teacher) => teacher.id === query.teacherId)
      : allTeachers;
    const requestsByTeacherMonth = new Map<
      string,
      TeacherDocumentSignatureRequest
    >();

    requests.forEach((request) => {
      const yearMonth = this.getYearMonthFromDateString(request.startDate);
      if (!yearMonth) return;

      const key = this.getAnnualHistoryRequestKey(request.teacherId, yearMonth);
      const existingRequest = requestsByTeacherMonth.get(key);
      const shouldUseRequest =
        !existingRequest ||
        (request.status === TeacherDocumentSignatureRequestStatus.SIGNED &&
          existingRequest.status !==
            TeacherDocumentSignatureRequestStatus.SIGNED);

      if (shouldUseRequest) {
        requestsByTeacherMonth.set(key, request);
      }
    });

    const rows = teachers.flatMap((teacher) =>
      periods.map((period) => {
        const request =
          requestsByTeacherMonth.get(
            this.getAnnualHistoryRequestKey(teacher.id, period.yearMonth),
          ) || null;
        const status: TeacherDocumentSignatureRequestStatus | 'not_sent' =
          request?.status || 'not_sent';

        return {
          teacherId: teacher.id,
          teacherName: teacher.name,
          teacherBusinessName: teacher.businessName || null,
          documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
          startDate: period.startDate,
          endDate: period.endDate,
          month: period.month,
          monthLabel: period.monthLabel,
          summaryOnly: true,
          status,
          request: request ? this.toResponse(request) : null,
          reason: request?.rejection_reason || null,
        };
      }),
    );

    return {
      body: rows,
    };
  }

  private getTrackingRequestKey(
    teacherId: number,
    summaryOnly: boolean,
  ): string {
    return `${teacherId}:${summaryOnly ? 'summary' : 'detail'}`;
  }

  private getAnnualHistoryRequestKey(
    teacherId: number,
    yearMonth: string,
  ): string {
    return `${teacherId}:${yearMonth}`;
  }

  private formatYearMonthDay(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
      2,
      '0',
    )}`;
  }

  private getYearMonthFromDateString(value: string): string | null {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
    if (!match) return null;

    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
  }

  private getDaysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  private getMonthLabel(year: number, month: number): string {
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  private buildMonthlyPeriodsForYear(year: number): Array<{
    startDate: string;
    endDate: string;
    month: number;
    monthLabel: string;
    yearMonth: string;
  }> {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return {
        startDate: this.formatYearMonthDay(year, month, 1),
        endDate: this.formatYearMonthDay(
          year,
          month,
          this.getDaysInMonth(year, month),
        ),
        month,
        monthLabel: this.getMonthLabel(year, month),
        yearMonth: `${year}-${String(month).padStart(2, '0')}`,
      };
    });
  }

  async getAdminRequestPreview(
    locationSlug: string,
    locationId: number,
    requestId: number,
    requestedSummaryOnly?: boolean,
  ): Promise<{
    body: {
      request: TeacherDocumentSignatureRequestResponseDto;
      documentData: unknown;
      locationDetails: unknown;
    };
  }> {
    const request = await this.requestRepository.findByIdForLocation(
      requestId,
      locationId,
    );

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    const documentData = await this.resolveDocumentDataForRequestedMode(
      locationSlug,
      request,
      requestedSummaryOnly ?? Boolean(request.summaryOnly),
    );
    const locationDetails =
      await this.locationService.getLocationDetailsBySlug(locationSlug);

    return {
      body: {
        request: this.toResponse(request),
        documentData,
        locationDetails,
      },
    };
  }

  /**
   * Ad-hoc preview of the document a teacher would receive for a period, built
   * on the fly without creating a signature request. Used by the batch send
   * screen so an admin can review each instructor's invoice before sending.
   * The invoiced-lessons/time-voucher services scope their queries to the
   * location internally, so a teacher outside this location simply yields an
   * empty document rather than leaking another location's data.
   */
  async previewTeacherDocument(
    locationSlug: string,
    teacherId: number,
    query: {
      documentType: TeacherDocumentSignatureRequestType;
      startDate: string;
      endDate: string;
      summaryOnly?: boolean;
    },
  ): Promise<{ body: TeacherDocumentPreviewDto }> {
    const [documentData, locationDetails, disclosureSnapshot] =
      await Promise.all([
        this.buildDocumentDataSnapshot(locationSlug, teacherId, {
          documentType: query.documentType,
          startDate: query.startDate,
          endDate: query.endDate,
          summaryOnly: query.summaryOnly,
        }),
        this.locationService.getLocationDetailsBySlug(locationSlug),
        this.disclosureService.getDisclosureContent(query.documentType),
      ]);

    return {
      body: {
        documentType: query.documentType,
        startDate: query.startDate,
        endDate: query.endDate,
        summaryOnly: query.summaryOnly === true,
        documentData,
        locationDetails,
        disclosureSnapshot: disclosureSnapshot ?? null,
      },
    };
  }

  redactTeacherDocumentPreviewFinancialFields(preview: {
    body: TeacherDocumentPreviewDto;
  }): { body: TeacherDocumentPreviewDto } {
    if (
      preview.body.documentType !==
      String(TeacherDocumentSignatureRequestType.INVOICED_LESSONS)
    ) {
      return preview;
    }

    return {
      body: {
        ...preview.body,
        documentData: this.redactInvoicedLessonsFinancialFields(
          preview.body.documentData,
        ),
      },
    };
  }

  redactAdminPreviewFinancialFields(preview: {
    body: {
      request: TeacherDocumentSignatureRequestResponseDto;
      documentData: unknown;
      locationDetails: unknown;
    };
  }): {
    body: {
      request: TeacherDocumentSignatureRequestResponseDto;
      documentData: unknown;
      locationDetails: unknown;
    };
  } {
    if (
      preview.body.request.documentType !==
      String(TeacherDocumentSignatureRequestType.INVOICED_LESSONS)
    ) {
      return preview;
    }

    return {
      body: {
        ...preview.body,
        documentData: this.redactInvoicedLessonsFinancialFields(
          preview.body.documentData,
        ),
      },
    };
  }

  redactAdminRequestStatusFinancialFields(result: {
    body: TeacherDocumentSignatureRequestResponseDto | null;
  }): { body: TeacherDocumentSignatureRequestResponseDto | null } {
    const request = result.body;

    if (
      !request ||
      request.documentType !==
        String(TeacherDocumentSignatureRequestType.INVOICED_LESSONS)
    ) {
      return result;
    }

    return {
      body: {
        ...request,
        documentDataSnapshot: this.redactInvoicedLessonsFinancialFields(
          request.documentDataSnapshot,
        ),
      },
    };
  }

  async getRequestForAdmin(
    locationSlug: string,
    locationId: number,
    teacherId: number,
    dto: CreateTeacherDocumentSignatureRequestDto,
  ): Promise<{ body: TeacherDocumentSignatureRequestResponseDto | null }> {
    const lookupParams = {
      locationId,
      teacherId,
      documentType: dto.documentType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      summaryOnly: dto.summaryOnly === true,
    };
    const request =
      await this.requestRepository.findLatestSignedRequestWithSummaryFallback(
        lookupParams,
      );

    if (!request) {
      return { body: null };
    }

    const response = this.toResponse(request, true);
    response.documentDataSnapshot =
      await this.resolveDocumentDataForRequestedMode(
        locationSlug,
        request,
        dto.summaryOnly === true,
      );

    return { body: response };
  }

  async getActiveRequestForAdmin(
    locationId: number,
    teacherId: number,
    dto: CreateTeacherDocumentSignatureRequestDto,
  ): Promise<{ body: TeacherDocumentSignatureRequestResponseDto | null }> {
    const request = await this.requestRepository.findActiveRequest({
      locationId,
      teacherId,
      documentType: dto.documentType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      summaryOnly: dto.summaryOnly === true,
    });

    return {
      body: request ? this.toResponse(request) : null,
    };
  }

  async getSignedOverlappingRequestsForAdmin(
    locationId: number,
    teacherId: number,
    dto: CreateTeacherDocumentSignatureRequestDto,
  ): Promise<{ body: TeacherDocumentSignatureRequestResponseDto[] }> {
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException(
        'Start date must be before or equal to end date',
      );
    }

    const requests = await this.requestRepository.findSignedOverlappingRequests(
      {
        locationId,
        teacherId,
        documentType: dto.documentType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        summaryOnly: dto.summaryOnly === true,
      },
    );

    return {
      body: requests.map((request) => this.toResponse(request)),
    };
  }

  async tempSignTeacherRequest(
    locationId: number,
    teacherId: number,
    requestId: number,
  ): Promise<SignedTeacherDocumentResponse> {
    const effectiveTeacherId = await this.resolvePortalTeacherIdForLocation(
      teacherId,
      locationId,
    );
    const request = await this.requestRepository.findByIdForTeacher(
      requestId,
      locationId,
      effectiveTeacherId,
    );

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.VOID) {
      throw new BadRequestException(
        'This document has been voided by the school and can no longer be signed.',
      );
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.CANCELLED) {
      throw new BadRequestException('Signature request has been cancelled');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.SIGNED) {
      return {
        body: this.toResponse(request),
      };
    }

    const signedRequest = await this.requestRepository.markSigned(
      request,
      effectiveTeacherId,
    );
    const notification = await this.trySendSignatureCompletedEmail(
      locationId,
      effectiveTeacherId,
      signedRequest,
    );

    return {
      body: this.toResponse(signedRequest),
      notification,
    };
  }

  async signTeacherRequest(
    locationId: number,
    teacherId: number,
    requestId: number,
    dto: SignTeacherDocumentSignatureRequestDto,
  ): Promise<SignedTeacherDocumentResponse> {
    const effectiveTeacherId = await this.resolvePortalTeacherIdForLocation(
      teacherId,
      locationId,
    );
    const request = await this.requestRepository.findByIdForTeacher(
      requestId,
      locationId,
      effectiveTeacherId,
    );

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.VOID) {
      throw new BadRequestException(
        'This document has been voided by the school and can no longer be signed.',
      );
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.CANCELLED) {
      throw new BadRequestException('Signature request has been cancelled');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.SIGNED) {
      return {
        body: this.toResponse(request),
      };
    }

    const signerName = dto.signerName.trim();

    if (!signerName) {
      throw new BadRequestException('Signer name is required');
    }

    if (
      dto.signatureDataUrl &&
      !this.isValidSignatureDataUrl(dto.signatureDataUrl)
    ) {
      throw new BadRequestException('A valid signature image is required');
    }

    const signedRequest = await this.requestRepository.markElectronicallySigned(
      request,
      {
        signedByUserId: effectiveTeacherId,
        signerName,
        signatureDataUrl: dto.signatureDataUrl || null,
      },
    );
    const notification = await this.trySendSignatureCompletedEmail(
      locationId,
      effectiveTeacherId,
      signedRequest,
    );

    return {
      body: this.toResponse(signedRequest),
      notification,
    };
  }

  async rejectTeacherRequest(
    locationId: number,
    teacherId: number,
    requestId: number,
    dto: RejectTeacherDocumentSignatureRequestDto,
    // current resuing SignedTeacherDocumentResponse, let me know if you want a new interface for rejected response
  ): Promise<RejectedTeacherDocumentResponse> {
    const effectiveTeacherId = await this.resolvePortalTeacherIdForLocation(
      teacherId,
      locationId,
    );

    const request = await this.requestRepository.findByIdForTeacher(
      requestId,
      locationId,
      effectiveTeacherId,
    );

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.CANCELLED) {
      throw new BadRequestException('Signature request has been cancelled');
    }

    if (request.status === TeacherDocumentSignatureRequestStatus.SIGNED) {
      throw new BadRequestException('Signature request has been signed');
    }

    // matching already signed logic in signTeacherRequest, but for rejeected
    if (request.status === TeacherDocumentSignatureRequestStatus.REJECTED) {
      return {
        body: this.transformationService.transformRejection(request)
      }
    }

    // not empty enforced in DTO via class-validator(IsNotEmpty)
    const reason = dto.rejection_reason?.trim();

    const rejectedRequest = await this.requestRepository.markRejected(
      request,
      reason,
    );

    const response = this.transformationService.transformRejection(rejectedRequest);

    const notification = await this.trySendSignatureRejectedEmail(
      locationId,
      effectiveTeacherId,
      rejectedRequest,
    );

    return {
      body: response,
      notification,
    };
  }

  private async assertTeacherInLocation(
    locationId: number,
    teacherId: number,
  ): Promise<void> {
    const [user, userLocation, teacherRole] = await Promise.all([
      this.userRepository.findOne({
        where: {
          id: teacherId,
          isDeleted: false,
          status: User.STATUS_ACTIVE,
        },
      }),
      this.userLocationRepository.findOne({
        where: {
          userId: teacherId,
          locationId,
        },
      }),
      this.assignmentRepository.findOne({
        where: {
          user_id: teacherId.toString(),
          item_name: 'teacher',
        },
      }),
    ]);

    if (!user || !userLocation || !teacherRole) {
      throw new NotFoundException('Teacher not found for this location');
    }
  }

  private async resolvePortalTeacherIdForLocation(
    currentUserId: number,
    locationId: number,
  ): Promise<number> {
    return (
      (await resolvePortalUserIdByLocation(
        this.userRepository,
        currentUserId,
        locationId,
      )) ?? currentUserId
    );
  }

  private async getNotificationContext(
    locationId: number,
    teacherId: number,
  ): Promise<TeacherSignatureNotificationContext> {
    const location = (await this.locationRepository.getLocationDetails(
      locationId,
    )) as TeacherSignatureLocationContext | null;
    const teacher = await this.findUserEmailRecipient(teacherId);

    const fromEmail = this.normalizeEmail(
      location?.email || process.env.FROM_MAIL_USER || '',
    );

    if (!location) {
      throw new NotFoundException(`Location not found for id ${locationId}`);
    }

    if (!fromEmail) {
      throw new BadRequestException(
        'Location email is required before sending signature request email',
      );
    }

    if (!teacher?.email) {
      throw new BadRequestException(
        'Teacher primary email is required before sending signature request email',
      );
    }

    return {
      fromEmail,
      locationName: location.name || 'Arcadia Academy of Music',
      locationSlug: location.slug,
      teacherEmail: teacher.email,
      teacherName:
        [teacher.firstname, teacher.lastname]
          .filter(Boolean)
          .join(' ')
          .trim() || teacher.email,
    };
  }

  private async trySendSignatureRequestEmail(
    locationId: number,
    teacherId: number,
    request: TeacherDocumentSignatureRequest,
  ): Promise<TeacherSignatureNotificationResponse> {
    try {
      const notificationContext = await this.getNotificationContext(
        locationId,
        teacherId,
      );

      await this.sendSignatureRequestEmail(notificationContext, request);

      return {
        emailSent: true,
      };
    } catch (error) {
      console.error(
        'Teacher signature request email notification failed:',
        error,
      );

      return {
        emailSent: false,
        message:
          'Signature request was created, but email notification failed. Please manually ask the teacher to check the Sign PDFs page.',
      };
    }
  }

  private async trySendSignatureCompletedEmail(
    locationId: number,
    teacherId: number,
    request: TeacherDocumentSignatureRequest,
  ): Promise<TeacherSignatureNotificationResponse> {
    try {
      const notificationContext = await this.getCompletedNotificationContext(
        locationId,
        teacherId,
      );

      await this.sendSignatureCompletedEmail(notificationContext, request);

      return {
        emailSent: true,
      };
    } catch (error) {
      console.error(
        'Teacher signature completed email notification failed:',
        error,
      );

      return {
        emailSent: false,
        message:
          'Document was signed, but email notification failed. Please check the Signature Tracking page for the signed document.',
      };
    }
  }

  private async trySendSignatureRejectedEmail(
    locationId: number,
    teacherId: number,
    request: TeacherDocumentSignatureRequest,
  ): Promise<TeacherSignatureNotificationResponse> {
    try {
      const notificationContext = await this.getRejectedNotificationContext(
        locationId,
        teacherId,
      );

      await this.sendSignatureRejectedEmail(notificationContext, request);

      return {
        emailSent: true,
      };
    } catch (error) {
      console.error(
        'Teacher signature rejected email notification failed: ',
        error,
      );


      return {
        emailSent: false,
        message: 
        'Document was rejected, but email notification failed. Please manually notify the requester.',
      };
    }
  }

  private async findUserEmailRecipient(userId: number): Promise<{
    email: string;
    firstname: string | null;
    lastname: string | null;
  } | null> {
    const row = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user_contact', 'contact', 'contact.userId = user.id')
      .innerJoin('user_email', 'email', 'email.userContactId = contact.id')
      .leftJoin('user_profile', 'profile', 'profile.user_id = user.id')
      .select('email.email', 'email')
      .addSelect('profile.firstname', 'firstname')
      .addSelect('profile.lastname', 'lastname')
      .where('user.id = :userId', { userId })
      .andWhere('contact.isPrimary = 1')
      .andWhere('contact.isDeleted = 0')
      .andWhere('email.isDeleted = 0')
      .andWhere('user.isDeleted = 0')
      .orderBy('email.id', 'ASC')
      .limit(1)
      .getRawOne<{
        email: string;
        firstname: string | null;
        lastname: string | null;
      }>();

    if (!row?.email) {
      return null;
    }

    return {
      ...row,
      email: this.normalizeEmail(row.email),
    };
  }

  /**
   * Batched counterpart to findUserEmailRecipient: given a set of teacher ids,
   * returns those that have a usable primary email. Used by the batch preflight
   * so it can flag "no email on file" instructors in one query rather than one
   * lookup per teacher.
   */
  private async findTeacherIdsWithPrimaryEmail(
    userIds: number[],
  ): Promise<Set<number>> {
    if (userIds.length === 0) {
      return new Set();
    }

    const rows = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user_contact', 'contact', 'contact.userId = user.id')
      .innerJoin('user_email', 'email', 'email.userContactId = contact.id')
      .select('user.id', 'id')
      .distinct(true)
      .where('user.id IN (:...userIds)', { userIds })
      .andWhere('contact.isPrimary = 1')
      .andWhere('contact.isDeleted = 0')
      .andWhere('email.isDeleted = 0')
      .andWhere('user.isDeleted = 0')
      .andWhere("email.email <> ''")
      .getRawMany<{ id: number }>();

    return new Set(rows.map((row) => Number(row.id)));
  }

  private async getCompletedNotificationContext(
    locationId: number,
    teacherId: number,
  ): Promise<TeacherSignatureCompletedNotificationContext> {
    const location = (await this.locationRepository.getLocationDetails(
      locationId,
    )) as TeacherSignatureLocationContext | null;
    const teacher = await this.findUserEmailRecipient(teacherId);

    const fromEmail = this.normalizeEmail(
      location?.email || process.env.FROM_MAIL_USER || '',
    );

    if (!location) {
      throw new NotFoundException(`Location not found for id ${locationId}`);
    }

    if (!fromEmail) {
      throw new BadRequestException(
        'Location email is required before sending signature completion email',
      );
    }

    return {
      fromEmail,
      locationName: location.name || 'Arcadia Academy of Music',
      locationSlug: location.slug,
      teacherName:
        [teacher?.firstname, teacher?.lastname]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        teacher?.email ||
        'Teacher',
    };
  }

  private async getRejectedNotificationContext(
    locationId: number,
    teacherId: number,
  ): Promise<TeacherSignatureRejectedNotificationContext> {
    const location = (await this.locationRepository.getLocationDetails(
      locationId,
    )) as TeacherSignatureLocationContext | null;
    const teacher = await this.findUserEmailRecipient(teacherId);

    const fromEmail = this.normalizeEmail(
      location?.email || process.env.FROM_MAIL_USER || '',
    );

    if (!location) {
      throw new NotFoundException(`Location not found for id ${locationId}`);
    }

    if (!fromEmail) {
      throw new BadRequestException(
        'Location email is required before sending signature rejection email',
      );
    }

    return {
      fromEmail,
      locationName: location.name || 'Arcadia Academy of Music',
      locationSlug: location.slug,
      requesterEmail: fromEmail,
      teacherEmail: teacher?.email || null,
      teacherName:
        [teacher?.firstname, teacher?.lastname]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        teacher?.email ||
        'Teacher',
    };
  }

  private async sendSignatureRequestEmail(
    context: TeacherSignatureNotificationContext,
    request: TeacherDocumentSignatureRequest,
  ): Promise<void> {
    // Goes to the instructor only — school staff are notified once the
    // document is actually signed, not when the request is raised.
    await this.mailerService.sendEmail({
      from: context.fromEmail,
      replyTo: context.fromEmail,
      to: [context.teacherEmail],
      subject: `Signature requested for ${this.getDocumentTypeLabel(request.documentType)}`,
      html: this.buildSignatureRequestEmailHtml(context, request),
    });
  }

  private async sendSignatureCompletedEmail(
    context: TeacherSignatureCompletedNotificationContext,
    request: TeacherDocumentSignatureRequest,
  ): Promise<void> {
    // Goes to the school's main address only. The instructor is deliberately
    // not copied: they already have the document in the portal, and the school
    // is the party that needs to know it came back signed.
    await this.mailerService.sendEmail({
      from: context.fromEmail,
      replyTo: context.fromEmail,
      to: [context.fromEmail],
      subject: `${this.getDocumentTypeLabel(request.documentType)} signed by ${context.teacherName}`,
      html: this.buildSignatureCompletedEmailHtml(context, request),
    });
  }

  private async sendSignatureRejectedEmail(
    context: TeacherSignatureRejectedNotificationContext,
    request: TeacherDocumentSignatureRequest,
  ): Promise<void> {
    await this.mailerService.sendEmail({
      from: context.fromEmail,
      replyTo: context.fromEmail,
      to: [context.requesterEmail],
      cc: context.teacherEmail ? [context.teacherEmail] : undefined,
      subject: `${this.getDocumentTypeLabel(request.documentType)} rejected by ${context.teacherName}`,
      html: this.buildSignatureRejectedEmailHtml(context, request),
    })
  }

  private buildSignatureRequestEmailHtml(
    context: TeacherSignatureNotificationContext,
    request: TeacherDocumentSignatureRequest,
  ): string {
    const signPdfUrl = this.getSignPdfsUrl(context.locationSlug);

    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5;">
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">Dear ${this.escapeHtml(context.teacherName)},</p>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">A document is ready for your review and electronic signature in the SMW teacher portal.</p>
        <table style="width:100%;max-width:640px;border-collapse:collapse;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:16px 0;">
          ${this.emailRow('Location', context.locationName)}
          ${this.emailRow('Document', this.getDocumentTypeLabel(request.documentType))}
          ${this.emailRow('Date range', `${this.formatEmailDate(request.startDate)} - ${this.formatEmailDate(request.endDate)}`)}
          ${this.emailRow('Summary only', request.summaryOnly ? 'Yes' : 'No')}
          ${this.emailRow('Requested at', request.requestedAt ? this.formatEmailDateTime(request.requestedAt) : '')}
        </table>
        <p style="font-size:14px;margin:16px 0;color:#111;">
          Please sign in to review and sign the document:
          <a href="${this.escapeHtml(signPdfUrl)}" style="color:#2563eb;text-decoration:underline;">${this.escapeHtml(signPdfUrl)}</a>
        </p>
        <p style="font-size:14px;margin:16px 0 0 0;color:#111;">Thank you<br>${this.escapeHtml(context.locationName)}</p>
      </div>
    `;
  }

  private buildSignatureCompletedEmailHtml(
    context: TeacherSignatureCompletedNotificationContext,
    request: TeacherDocumentSignatureRequest,
  ): string {
    const adminTeacherUrl = this.getAdminTeacherUrl(
      context.locationSlug,
      request.teacherId,
    );

    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5;">
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">Hello,</p>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">${this.escapeHtml(context.teacherName)} has signed a teacher document in SMW.</p>
        <table style="width:100%;max-width:640px;border-collapse:collapse;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:16px 0;">
          ${this.emailRow('Location', context.locationName)}
          ${this.emailRow('Teacher', context.teacherName)}
          ${this.emailRow('Document', this.getDocumentTypeLabel(request.documentType))}
          ${this.emailRow('Date range', `${this.formatEmailDate(request.startDate)} - ${this.formatEmailDate(request.endDate)}`)}
          ${this.emailRow('Summary only', request.summaryOnly ? 'Yes' : 'No')}
          ${this.emailRow('Signed at', request.signedAt ? this.formatEmailDateTime(request.signedAt) : '')}
          ${this.emailRow('Signer name', request.signedSignerName || context.teacherName)}
        </table>
        <p style="font-size:14px;margin:16px 0;color:#111;">
          View the teacher record:
          <a href="${this.escapeHtml(adminTeacherUrl)}" style="color:#2563eb;text-decoration:underline;">${this.escapeHtml(adminTeacherUrl)}</a>
        </p>
        <p style="font-size:14px;margin:16px 0 0 0;color:#111;">Thank you<br>${this.escapeHtml(context.locationName)}</p>
      </div>
    `;
  }

  private buildSignatureRejectedEmailHtml(
    context: TeacherSignatureRejectedNotificationContext,
    request: TeacherDocumentSignatureRequest,
  ): string {
    const adminTeacherUrl = this.getAdminTeacherUrl(
      context.locationSlug,
      request.teacherId,
    );

    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5;">
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">Hello,</p>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">${this.escapeHtml(context.teacherName)} has rejected a teacher document in SMW.</p>
        <table style="width:100%;max-width:640px;border-collapse:collapse;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:16px 0;">
          ${this.emailRow('Location', context.locationName)}
          ${this.emailRow('Teacher', context.teacherName)}
          ${this.emailRow('Document', this.getDocumentTypeLabel(request.documentType))}
          ${this.emailRow('Date range', `${this.formatEmailDate(request.startDate)} - ${this.formatEmailDate(request.endDate)}`)}
          ${this.emailRow('Summary only', request.summaryOnly ? 'Yes' : 'No')}
          ${this.emailRow('Rejected at', request.updatedOn ? this.formatEmailDateTime(request.updatedOn) : '')}
          ${this.emailRow('Rejected By',  context.teacherName)}
          ${this.emailRow('Reason', request.rejection_reason ?? '—',)}
        </table>
        <p style="font-size:14px;margin:16px 0;color:#111;">
          View the teacher record:
          <a href="${this.escapeHtml(adminTeacherUrl)}" style="color:#2563eb;text-decoration:underline;">${this.escapeHtml(adminTeacherUrl)}</a>
        </p>
        <p style="font-size:14px;margin:16px 0 0 0;color:#111;">Thank you<br>${this.escapeHtml(context.locationName)}</p>
      </div>
    `;
  }

  private emailRow(
    label: string,
    value: string | number | boolean | null | undefined,
  ): string {
    return `
      <tr>
        <th style="text-align:left;border:1px solid #ddd;padding:6px;background-color:#f3f4f6;font-weight:600;width:180px;vertical-align:top;">${this.escapeHtml(label)}</th>
        <td style="border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top;">${this.escapeHtml(value ?? '')}</td>
      </tr>
    `;
  }

  private getDocumentTypeLabel(
    documentType: TeacherDocumentSignatureRequestType,
  ): string {
    return documentType === TeacherDocumentSignatureRequestType.TIME_VOUCHER
      ? 'Time Voucher'
      : 'Invoiced Lessons';
  }

  private getSignPdfsUrl(locationSlug: string): string {
    const baseUrl = (
      process.env.BASE_URL || 'https://smw.arcadiamusicacademy.com'
    ).replace(/\/$/, '');
    const v2BaseUrl = baseUrl.endsWith('/v2') ? baseUrl : `${baseUrl}/v2`;

    return `${v2BaseUrl}/user/${encodeURIComponent(locationSlug)}/sign-pdfs`;
  }

  private getAdminTeacherUrl(locationSlug: string, teacherId: number): string {
    const baseUrl = (
      process.env.BASE_URL || 'https://smw.arcadiamusicacademy.com'
    ).replace(/\/$/, '');
    const v2BaseUrl = baseUrl.endsWith('/v2') ? baseUrl : `${baseUrl}/v2`;

    return `${v2BaseUrl}/admin/${encodeURIComponent(locationSlug)}/teachers/${encodeURIComponent(String(teacherId))}`;
  }

  private formatEmailDate(value: string): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));

    if (year && month && day) {
      return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(year, month - 1, day)));
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private formatEmailDateTime(value: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    }).format(value);
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private escapeHtml(
    value: string | number | boolean | null | undefined,
  ): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private toResponse(
    request: TeacherDocumentSignatureRequest,
    includeDocumentDataSnapshot = false,
  ): TeacherDocumentSignatureRequestResponseDto {
    return {
      id: request.id,
      teacherId: request.teacherId,
      documentType: request.documentType,
      startDate: request.startDate,
      endDate: request.endDate,
      summaryOnly: Boolean(request.summaryOnly),
      status: request.status,
      requestedAt: request.requestedAt,
      lastRemindedAt: request.lastRemindedAt,
      signedAt: request.signedAt,
      signedSignerName: request.signedSignerName,
      signedSignatureDataUrl: request.signedSignatureDataUrl,
      voidedAt: request.voidedAt,
      voidReason: request.voidReason,
      disclosureSnapshot: request.disclosureSnapshot,
      documentDataSnapshot: includeDocumentDataSnapshot
        ? this.parseDocumentDataSnapshot(request.documentDataSnapshot)
        : null,
    };
  }

  private redactInvoicedLessonsFinancialFields(documentData: unknown): unknown {
    if (!documentData || typeof documentData !== 'object') {
      return documentData;
    }

    const data = documentData as {
      body?: Array<
        | {
            date?: string;
            duration?: number;
            cost?: string;
          }
        | {
            invoiceDate?: string;
            totalDuration?: number;
            totalCost?: string;
            lessons?: Array<{
              time?: string | null;
              program?: string | null;
              student?: string | null;
              duration?: number;
              rate?: string;
              cost?: string;
            }>;
          }
      >;
      totalCost?: string;
      totalDuration?: number;
      adjustments?: Array<Record<string, unknown>>;
    };

    return {
      ...data,
      totalCost: '',
      body: (data.body || []).map((item) => {
        if ('lessons' in item) {
          return {
            ...item,
            totalCost: '',
            lessons: (item.lessons || []).map((lesson) => ({
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
      }),
      adjustments: data.adjustments?.map((adjustment) => ({
        ...adjustment,
        hourlyRate: null,
        adjustmentAmount: null,
      })),
    };
  }

  private async buildDocumentDataSnapshot(
    locationSlug: string,
    teacherId: number,
    request: {
      documentType: TeacherDocumentSignatureRequestType;
      startDate: string;
      endDate: string;
      summaryOnly?: boolean;
    },
  ): Promise<unknown> {
    // Detailed data is the canonical snapshot: it can render both report
    // variants, while a summary-only snapshot cannot reconstruct lesson rows.
    return this.fetchDocumentData(locationSlug, teacherId, request, false);
  }

  private async resolveDocumentDataForRequestedMode(
    locationSlug: string,
    request: TeacherDocumentSignatureRequest,
    requestedSummaryOnly: boolean,
  ): Promise<unknown> {
    const snapshot =
      this.parseDocumentDataSnapshot(request.documentDataSnapshot) ??
      (await this.fetchDocumentData(
        locationSlug,
        request.teacherId,
        request,
        false,
      ));

    if (
      requestedSummaryOnly ||
      Number(request.summaryOnly) !== 1 ||
      this.hasDetailedLessonRows(snapshot)
    ) {
      return snapshot;
    }

    // Legacy summary requests did not retain lesson rows. Detailed output is
    // reconstructed only while the current summary still exactly matches the
    // signed summary, so changed totals or adjustments never inherit an old
    // signature.
    const currentSummary = await this.fetchDocumentData(
      locationSlug,
      request.teacherId,
      request,
      true,
    );

    if (!this.summariesMatch(request.documentType, snapshot, currentSummary)) {
      return snapshot;
    }

    return this.fetchDocumentData(
      locationSlug,
      request.teacherId,
      request,
      false,
    );
  }

  private fetchDocumentData(
    locationSlug: string,
    teacherId: number,
    request: {
      documentType: TeacherDocumentSignatureRequestType;
      startDate: string;
      endDate: string;
    },
    summaryOnly: boolean,
  ): Promise<unknown> {
    return request.documentType ===
      TeacherDocumentSignatureRequestType.TIME_VOUCHER
      ? this.timeVoucherService.getTeacherTimeVoucher(
          locationSlug,
          teacherId,
          request.startDate,
          request.endDate,
          summaryOnly,
        )
      : this.invoicedLessonsService.getTeacherInvoicedLessons(
          locationSlug,
          teacherId,
          request.startDate,
          request.endDate,
          summaryOnly,
        );
  }

  private hasDetailedLessonRows(documentData: unknown): boolean {
    if (!documentData || typeof documentData !== 'object') {
      return false;
    }

    const body = (documentData as { body?: unknown }).body;
    return (
      Array.isArray(body) &&
      body.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          Array.isArray((item as { lessons?: unknown }).lessons),
      )
    );
  }

  private summariesMatch(
    documentType: TeacherDocumentSignatureRequestType,
    signedSummary: unknown,
    currentSummary: unknown,
  ): boolean {
    return (
      JSON.stringify(this.getComparableSummary(documentType, signedSummary)) ===
      JSON.stringify(this.getComparableSummary(documentType, currentSummary))
    );
  }

  private getComparableSummary(
    documentType: TeacherDocumentSignatureRequestType,
    documentData: unknown,
  ): unknown {
    const data = documentData as {
      totalCost?: string;
      totalDuration?: number;
      footer?: { totalDuration?: number };
      adjustments?: unknown[];
    } | null;

    return documentType === TeacherDocumentSignatureRequestType.TIME_VOUCHER
      ? {
          totalDuration: Number(data?.footer?.totalDuration || 0),
          adjustments: data?.adjustments || [],
        }
      : {
          totalDuration: Number(data?.totalDuration || 0),
          totalCost: data?.totalCost || '',
          adjustments: data?.adjustments || [],
        };
  }

  private parseDocumentDataSnapshot(value: string | null): unknown {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch (error) {
      console.error('Failed to parse teacher document data snapshot:', error);
      return null;
    }
  }

  private isValidSignatureDataUrl(value: string): boolean {
    return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(
      value,
    );
  }
}
