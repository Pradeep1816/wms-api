import { describe, expect, it, vi } from 'vitest';

// These services are only needed as Nest injection tokens here, but importing
// them for real pulls in transformation modules that `require()` a TypeScript
// file — which resolves only against the compiled build, not under vitest.
vi.mock('./teacher-invoiced-lessons.service', () => ({
  TeacherInvoicedLessonsService: class {},
}));
vi.mock('./teacher-time-voucher.service', () => ({
  TeacherTimeVoucherService: class {},
}));

import { TeacherDocumentSignatureRequestService } from './teacher-document-signature-request.service';
import {
  TeacherDocumentSignatureRequest,
  TeacherDocumentSignatureRequestStatus,
  TeacherDocumentSignatureRequestType,
} from '../entities/teacher-document-signature-request.entity';

const LOCATION_EMAIL = 'burlington@arcadiamusicacademy.com';
const TEACHER_EMAIL = 'lettmusic@hotmail.com';

interface SentEmail {
  from: string;
  replyTo: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
}

function createService(
  teacherEmail: string | null = TEACHER_EMAIL,
  storedRequest: TeacherDocumentSignatureRequest | null = null,
) {
  const queryBuilder = {
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawOne: vi
      .fn()
      .mockResolvedValue(
        teacherEmail
          ? { email: teacherEmail, firstname: 'Tung', lastname: 'Le' }
          : null,
      ),
  };

  const userRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(queryBuilder),
    // Used when resolving the portal user; returning null keeps the caller's
    // own teacher id, which is what the tests assert against.
    findOne: vi.fn().mockResolvedValue(null),
  };
  const locationRepository = {
    getLocationDetails: vi.fn().mockResolvedValue({
      email: LOCATION_EMAIL,
      name: 'Arcadia Academy of Music',
      slug: 'burlington',
    }),
  };
  const mailerService = {
    sendEmail: vi
      .fn<(payload: SentEmail) => Promise<void>>()
      .mockResolvedValue(undefined),
  };

  const requestRepository = {
    findByIdForLocation: vi.fn().mockResolvedValue(storedRequest),
    markVoided: vi
      .fn<
        (
          target: TeacherDocumentSignatureRequest,
          params: { voidedByUserId: number; reason: string },
        ) => Promise<TeacherDocumentSignatureRequest>
      >()
      .mockImplementation((target, params) =>
        Promise.resolve(
          Object.assign(target, {
            status: TeacherDocumentSignatureRequestStatus.VOID,
            voidedByUserId: params.voidedByUserId,
            voidedAt: new Date('2026-07-20'),
            voidReason: params.reason,
          }),
        ),
      ),
    markReminded: vi
      .fn<
        (
          target: TeacherDocumentSignatureRequest,
        ) => Promise<TeacherDocumentSignatureRequest>
      >()
      .mockImplementation((target) =>
        Promise.resolve(
          Object.assign(target, { lastRemindedAt: new Date('2026-07-20') }),
        ),
      ),
  };

  const service = new TeacherDocumentSignatureRequestService(
    userRepository as never,
    {} as never,
    {} as never,
    requestRepository as never,
    {} as never,
    {} as never,
    {} as never,
    locationRepository as never,
    mailerService as never,
    {} as never,
    {} as never,
  );

  return { service, mailerService, requestRepository };
}

function buildRequest(
  overrides: Partial<TeacherDocumentSignatureRequest> = {},
): TeacherDocumentSignatureRequest {
  return {
    id: 1,
    teacherId: 42,
    documentType: TeacherDocumentSignatureRequestType.TIME_VOUCHER,
    startDate: '2026-07-13',
    endDate: '2026-07-19',
    summaryOnly: false,
    status: TeacherDocumentSignatureRequestStatus.PENDING,
    requestedByUserId: 7,
    requestedAt: new Date('2026-07-15T12:00:00Z'),
    lastRemindedAt: null,
    signedAt: null,
    signedSignerName: null,
    ...overrides,
  } as unknown as TeacherDocumentSignatureRequest;
}

const request = {
  id: 1,
  teacherId: 42,
  documentType: TeacherDocumentSignatureRequestType.TIME_VOUCHER,
  startDate: '2026-07-13',
  endDate: '2026-07-19',
  summaryOnly: false,
  requestedByUserId: 7,
  requestedAt: new Date('2026-07-15T12:00:00Z'),
  signedAt: new Date('2026-07-15T18:00:00Z'),
  signedSignerName: 'Tung Le',
} as unknown as TeacherDocumentSignatureRequest;

describe('TeacherDocumentSignatureRequestService response normalization', () => {
  it('normalizes a MySQL tinyint summaryOnly value to a boolean', () => {
    const { service } = createService();
    const mysqlRequest = buildRequest({
      summaryOnly: 1 as unknown as boolean,
    });

    const response = service['toResponse'](mysqlRequest);

    expect(response.summaryOnly).toBe(true);
  });
});

describe('TeacherDocumentSignatureRequestService notifications', () => {
  describe('signature request email', () => {
    it('goes to the instructor only, without copying the requesting staff member', async () => {
      const { service, mailerService } = createService();

      const result = await service['trySendSignatureRequestEmail'](
        1,
        42,
        request,
      );

      expect(result.emailSent).toBe(true);
      expect(mailerService.sendEmail).toHaveBeenCalledTimes(1);

      const payload = mailerService.sendEmail.mock.calls[0][0];
      expect(payload.to).toEqual([TEACHER_EMAIL]);
      expect(payload.cc).toBeUndefined();
      expect(payload.from).toBe(LOCATION_EMAIL);
    });
  });

  describe('signature completed email', () => {
    it("goes to the school's main address only, without copying the instructor", async () => {
      const { service, mailerService } = createService();

      const result = await service['trySendSignatureCompletedEmail'](
        1,
        42,
        request,
      );

      expect(result.emailSent).toBe(true);

      const payload = mailerService.sendEmail.mock.calls[0][0];
      expect(payload.to).toEqual([LOCATION_EMAIL]);
      expect(payload.cc).toBeUndefined();
      expect(payload.from).toBe(LOCATION_EMAIL);
    });

    it('names the signing instructor in the subject even though they are not a recipient', async () => {
      const { service, mailerService } = createService();

      await service['trySendSignatureCompletedEmail'](1, 42, request);

      const payload = mailerService.sendEmail.mock.calls[0][0];
      expect(payload.subject).toContain('Tung Le');
      expect(payload.to).not.toContain(TEACHER_EMAIL);
    });

    it('still notifies the school when the instructor has no email on file', async () => {
      const { service, mailerService } = createService(null);

      const result = await service['trySendSignatureCompletedEmail'](
        1,
        42,
        request,
      );

      expect(result.emailSent).toBe(true);

      const payload = mailerService.sendEmail.mock.calls[0][0];
      expect(payload.to).toEqual([LOCATION_EMAIL]);
      expect(payload.cc).toBeUndefined();
    });
  });

  describe('resendSignatureReminder', () => {
    it('re-sends the request email to the instructor and stamps lastRemindedAt', async () => {
      const pending = buildRequest();
      const { service, mailerService, requestRepository } = createService(
        TEACHER_EMAIL,
        pending,
      );

      const result = await service.resendSignatureReminder(1, 1);

      expect(mailerService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mailerService.sendEmail.mock.calls[0][0].to).toEqual([
        TEACHER_EMAIL,
      ]);
      expect(requestRepository.markReminded).toHaveBeenCalledTimes(1);
      expect(result.body.lastRemindedAt).not.toBeNull();
      expect(result.notification?.emailSent).toBe(true);
    });

    it('keeps the original requested date so tracking still shows the first send', async () => {
      const pending = buildRequest();
      const { service } = createService(TEACHER_EMAIL, pending);

      const result = await service.resendSignatureReminder(1, 1);

      expect(result.body.requestedAt).toEqual(new Date('2026-07-15T12:00:00Z'));
      expect(result.body.id).toBe(1);
    });

    it('refuses to remind about an already signed document', async () => {
      const signed = buildRequest({
        status: TeacherDocumentSignatureRequestStatus.SIGNED,
        signedAt: new Date('2026-07-16T09:00:00Z'),
      });
      const { service, mailerService } = createService(TEACHER_EMAIL, signed);

      await expect(service.resendSignatureReminder(1, 1)).rejects.toThrow(
        /already been signed/,
      );
      expect(mailerService.sendEmail).not.toHaveBeenCalled();
    });

    it('does not stamp lastRemindedAt when the email fails to send', async () => {
      const pending = buildRequest();
      const { service, mailerService, requestRepository } = createService(
        TEACHER_EMAIL,
        pending,
      );
      mailerService.sendEmail.mockRejectedValueOnce(new Error('SMTP down'));

      const result = await service.resendSignatureReminder(1, 1);

      expect(result.notification?.emailSent).toBe(false);
      expect(requestRepository.markReminded).not.toHaveBeenCalled();
      expect(result.body.lastRemindedAt).toBeNull();
    });

    it('reports not found when the request does not belong to the location', async () => {
      const { service } = createService(TEACHER_EMAIL, null);

      await expect(service.resendSignatureReminder(1, 999)).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe('voidSignatureRequest', () => {
    it('marks a pending document void with who did it and why', async () => {
      const pending = buildRequest();
      const { service, requestRepository } = createService(
        TEACHER_EMAIL,
        pending,
      );

      const result = await service.voidSignatureRequest(1, 1, 7, {
        reason: 'Sent twice by mistake',
      });

      expect(requestRepository.markVoided).toHaveBeenCalledWith(pending, {
        voidedByUserId: 7,
        reason: 'Sent twice by mistake',
      });
      expect(result.body.status).toBe(
        TeacherDocumentSignatureRequestStatus.VOID,
      );
      expect(result.body.voidReason).toBe('Sent twice by mistake');
      expect(result.body.voidedAt).not.toBeNull();
    });

    it('voids a signed duplicate while keeping its signature on file', async () => {
      const signed = buildRequest({
        status: TeacherDocumentSignatureRequestStatus.SIGNED,
        signedAt: new Date('2026-07-16T09:00:00Z'),
        signedSignerName: 'Tung Le',
        signedSignatureDataUrl: 'data:image/png;base64,abc',
      });
      const { service } = createService(TEACHER_EMAIL, signed);

      const result = await service.voidSignatureRequest(1, 1, 7, {
        reason: 'Duplicate of request 12',
      });

      expect(result.body.status).toBe(
        TeacherDocumentSignatureRequestStatus.VOID,
      );
      // The signature is evidence and must survive the void.
      expect(result.body.signedSignatureDataUrl).toBe(
        'data:image/png;base64,abc',
      );
      expect(result.body.signedSignerName).toBe('Tung Le');
      expect(result.body.signedAt).not.toBeNull();
    });

    it('uses the void status rather than cancelled, which stays free for teacher-initiated cancellation', async () => {
      const pending = buildRequest();
      const { service } = createService(TEACHER_EMAIL, pending);

      const result = await service.voidSignatureRequest(1, 1, 7, {
        reason: 'Duplicate',
      });

      expect(result.body.status).toBe('void');
      expect(result.body.status).not.toBe('cancelled');
    });

    it('still voids a request the teacher had cancelled', async () => {
      const cancelled = buildRequest({
        status: TeacherDocumentSignatureRequestStatus.CANCELLED,
      });
      const { service } = createService(TEACHER_EMAIL, cancelled);

      const result = await service.voidSignatureRequest(1, 1, 7, {
        reason: 'Tidying up',
      });

      expect(result.body.status).toBe('void');
    });

    it('refuses to void a document twice', async () => {
      const voided = buildRequest({
        status: TeacherDocumentSignatureRequestStatus.VOID,
      });
      const { service, requestRepository } = createService(
        TEACHER_EMAIL,
        voided,
      );

      await expect(
        service.voidSignatureRequest(1, 1, 7, { reason: 'again' }),
      ).rejects.toThrow(/already void/i);
      expect(requestRepository.markVoided).not.toHaveBeenCalled();
    });

    it('rejects a blank reason so the audit record is never empty', async () => {
      const pending = buildRequest();
      const { service, requestRepository } = createService(
        TEACHER_EMAIL,
        pending,
      );

      await expect(
        service.voidSignatureRequest(1, 1, 7, { reason: '   ' }),
      ).rejects.toThrow(/reason is required/i);
      expect(requestRepository.markVoided).not.toHaveBeenCalled();
    });

    it('reports not found when the request does not belong to the location', async () => {
      const { service } = createService(TEACHER_EMAIL, null);

      await expect(
        service.voidSignatureRequest(1, 999, 7, { reason: 'nope' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('signing a voided document', () => {
    it('is rejected, so a teacher cannot sign what the school already voided', async () => {
      const voided = buildRequest({
        status: TeacherDocumentSignatureRequestStatus.VOID,
      });
      const { service, requestRepository } = createService(
        TEACHER_EMAIL,
        voided,
      );
      requestRepository.findByIdForTeacher = vi
        .fn()
        .mockResolvedValue(voided) as never;

      await expect(
        service.signTeacherRequest(1, 42, 1, { signerName: 'Tung Le' }),
      ).rejects.toThrow(/voided by the school/i);
    });
  });

  describe('resend after void', () => {
    it('will not remind about a voided document', async () => {
      const voided = buildRequest({
        status: TeacherDocumentSignatureRequestStatus.VOID,
      });
      const { service, mailerService } = createService(TEACHER_EMAIL, voided);

      await expect(service.resendSignatureReminder(1, 1)).rejects.toThrow(
        /only a pending/i,
      );
      expect(mailerService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('previewInvoicedLessonsBatch', () => {
    const BATCH_START = '2026-07-01';
    const BATCH_END = '2026-07-31';

    function invoiced(
      overrides: Partial<TeacherDocumentSignatureRequest>,
    ): TeacherDocumentSignatureRequest {
      return buildRequest({
        documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
        startDate: BATCH_START,
        endDate: BATCH_END,
        summaryOnly: false,
        ...overrides,
      });
    }

    function createBatchService(options: {
      teachers: Array<{
        id: number;
        name: string;
        businessName: string | null;
      }>;
      requests: TeacherDocumentSignatureRequest[];
      emailTeacherIds: number[];
      hasLessons?: (teacherId: number) => boolean;
    }) {
      const emailQueryBuilder = {
        innerJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        distinct: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawMany: vi
          .fn()
          .mockResolvedValue(options.emailTeacherIds.map((id) => ({ id }))),
      };
      const userRepository = {
        createQueryBuilder: vi.fn().mockReturnValue(emailQueryBuilder),
      };
      const requestRepository = {
        findByExactPeriodForLocation: vi
          .fn()
          .mockResolvedValue(options.requests),
      };
      const invoicedLessonsService = {
        hasInvoicedLessons: vi
          .fn()
          .mockImplementation((_locationId: number, teacherId: number) =>
            Promise.resolve(
              options.hasLessons ? options.hasLessons(teacherId) : true,
            ),
          ),
      };
      const timeVoucherService = {
        hasTimeVoucherLessons: vi
          .fn()
          .mockImplementation((_locationId: number, teacherId: number) =>
            Promise.resolve(
              options.hasLessons ? options.hasLessons(teacherId) : true,
            ),
          ),
      };
      const teacherService = {
        findTeachersByLocation: vi.fn().mockResolvedValue(options.teachers),
      };

      const service = new TeacherDocumentSignatureRequestService(
        userRepository as never,
        {} as never,
        {} as never,
        requestRepository as never,
        timeVoucherService as never,
        invoicedLessonsService as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        teacherService as never,
      );

      return {
        service,
        invoicedLessonsService,
        timeVoucherService,
        requestRepository,
      };
    }

    const byName = (
      rows: Array<{ teacherName: string }>,
      name: string,
    ): { skipReason: string | null; eligible: boolean } =>
      rows.find((row) => row.teacherName === name) as never;

    it('classifies each instructor and only counts the sendable ones as eligible', async () => {
      const { service } = createBatchService({
        teachers: [
          { id: 1, name: 'Anna', businessName: null },
          { id: 2, name: 'Bob', businessName: null },
          { id: 3, name: 'Cara', businessName: null },
          { id: 4, name: 'Dan', businessName: null },
          { id: 5, name: 'Eve', businessName: null },
        ],
        requests: [
          invoiced({
            id: 10,
            teacherId: 2,
            status: TeacherDocumentSignatureRequestStatus.SIGNED,
          }),
          invoiced({
            id: 11,
            teacherId: 3,
            status: TeacherDocumentSignatureRequestStatus.PENDING,
          }),
        ],
        // Dan (4) has no email; everyone else does.
        emailTeacherIds: [1, 5],
        // Eve (5) has nothing to invoice this month.
        hasLessons: (teacherId) => teacherId !== 5,
      });

      const { body } = await service.previewInvoicedLessonsBatch(1, {
        startDate: BATCH_START,
        endDate: BATCH_END,
        summaryOnly: false,
      });

      expect(body.totalCount).toBe(5);
      expect(body.eligibleCount).toBe(1);
      expect(body.skippedCount).toBe(4);
      expect(byName(body.rows, 'Anna').eligible).toBe(true);
      expect(byName(body.rows, 'Bob').skipReason).toBe('already_signed');
      expect(byName(body.rows, 'Cara').skipReason).toBe('already_pending');
      expect(byName(body.rows, 'Dan').skipReason).toBe('no_email');
      expect(byName(body.rows, 'Eve').skipReason).toBe('no_lessons');
    });

    it('treats a signed request for the other report type as already signed (send falls back across summaryOnly)', async () => {
      const { service } = createBatchService({
        teachers: [{ id: 1, name: 'Anna', businessName: null }],
        requests: [
          invoiced({
            id: 20,
            teacherId: 1,
            summaryOnly: true,
            status: TeacherDocumentSignatureRequestStatus.SIGNED,
          }),
        ],
        emailTeacherIds: [1],
      });

      const { body } = await service.previewInvoicedLessonsBatch(1, {
        startDate: BATCH_START,
        endDate: BATCH_END,
        summaryOnly: false,
      });

      expect(byName(body.rows, 'Anna').skipReason).toBe('already_signed');
    });

    it('does not let a pending request for the other report type block this batch', async () => {
      const { service } = createBatchService({
        teachers: [{ id: 1, name: 'Anna', businessName: null }],
        requests: [
          invoiced({
            id: 21,
            teacherId: 1,
            summaryOnly: true,
            status: TeacherDocumentSignatureRequestStatus.PENDING,
          }),
        ],
        emailTeacherIds: [1],
      });

      const { body } = await service.previewInvoicedLessonsBatch(1, {
        startDate: BATCH_START,
        endDate: BATCH_END,
        summaryOnly: false,
      });

      expect(byName(body.rows, 'Anna').eligible).toBe(true);
    });

    it('detects an already-pending request even when the driver returns summaryOnly as 0/1', async () => {
      const { service } = createBatchService({
        teachers: [{ id: 1, name: 'Anna', businessName: null }],
        requests: [
          invoiced({
            id: 30,
            teacherId: 1,
            // Mimic the mysql tinyint driver return: a number, not a boolean.
            summaryOnly: 0 as unknown as boolean,
            status: TeacherDocumentSignatureRequestStatus.PENDING,
          }),
        ],
        emailTeacherIds: [1],
      });

      const { body } = await service.previewInvoicedLessonsBatch(1, {
        startDate: BATCH_START,
        endDate: BATCH_END,
        summaryOnly: false,
      });

      expect(byName(body.rows, 'Anna').skipReason).toBe('already_pending');
      expect(byName(body.rows, 'Anna').eligible).toBe(false);
    });

    it('rejects an inverted date range', async () => {
      const { service } = createBatchService({
        teachers: [],
        requests: [],
        emailTeacherIds: [],
      });

      await expect(
        service.previewInvoicedLessonsBatch(1, {
          startDate: BATCH_END,
          endDate: BATCH_START,
          summaryOnly: false,
        }),
      ).rejects.toThrow(/before or equal/i);
    });

    it('classifies a time-voucher batch off scheduled lessons, matching on the time-voucher document type', async () => {
      const { service, timeVoucherService, invoicedLessonsService, requestRepository } =
        createBatchService({
          teachers: [
            { id: 1, name: 'Anna', businessName: null },
            { id: 2, name: 'Bob', businessName: null },
          ],
          requests: [],
          emailTeacherIds: [1, 2],
          // Bob has no time-voucher lessons this period.
          hasLessons: (teacherId) => teacherId === 1,
        });

      const { body } = await service.previewTimeVoucherBatch(1, {
        startDate: BATCH_START,
        endDate: BATCH_END,
        summaryOnly: false,
      });

      expect(requestRepository.findByExactPeriodForLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: TeacherDocumentSignatureRequestType.TIME_VOUCHER,
        }),
      );
      // The time-voucher path must use the time-voucher lessons check, never the
      // invoiced-lessons one.
      expect(timeVoucherService.hasTimeVoucherLessons).toHaveBeenCalled();
      expect(invoicedLessonsService.hasInvoicedLessons).not.toHaveBeenCalled();
      expect(byName(body.rows, 'Anna').eligible).toBe(true);
      expect(byName(body.rows, 'Bob').skipReason).toBe('no_lessons');
    });
  });
});

describe('TeacherDocumentSignatureRequestService signature tracking', () => {
  it('shows only the report types that were actually requested', async () => {
    const signedRequest = buildRequest({
      id: 2,
      summaryOnly: 1 as unknown as boolean,
      status: TeacherDocumentSignatureRequestStatus.SIGNED,
      signedAt: new Date('2026-07-31T12:00:00Z'),
    });
    const olderDetailedPendingRequest = buildRequest({
      id: 1,
      summaryOnly: false,
      status: TeacherDocumentSignatureRequestStatus.PENDING,
    });
    const requestRepository = {
      findLatestByRangeForTracking: vi
        .fn()
        .mockResolvedValue([olderDetailedPendingRequest, signedRequest]),
    };
    const teacherService = {
      findTeachersByLocation: vi
        .fn()
        .mockResolvedValue([{ id: 42, name: 'Claudia', businessName: null }]),
    };
    const service = new TeacherDocumentSignatureRequestService(
      {} as never,
      {} as never,
      {} as never,
      requestRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      teacherService as never,
    );

    const { body } = await service.getAdminSignatureTrackingReport(15, {
      documentType: TeacherDocumentSignatureRequestType.TIME_VOUCHER,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });

    expect(body).toHaveLength(2);
    expect(body.map((row) => row.summaryOnly).sort()).toEqual([false, true]);
    expect(body.find((row) => row.summaryOnly)?.status).toBe('signed');
    expect(body.find((row) => row.summaryOnly)?.request?.id).toBe(
      signedRequest.id,
    );
    expect(body.find((row) => !row.summaryOnly)?.status).toBe('pending');
    expect(body.find((row) => !row.summaryOnly)?.request?.id).toBe(
      olderDetailedPendingRequest.id,
    );
  });

  it('does not create a detailed tracking row for a summary-only request', async () => {
    const signedRequest = buildRequest({
      id: 2,
      summaryOnly: true,
      status: TeacherDocumentSignatureRequestStatus.SIGNED,
      signedAt: new Date('2026-07-31T12:00:00Z'),
    });
    const requestRepository = {
      findLatestByRangeForTracking: vi.fn().mockResolvedValue([signedRequest]),
    };
    const teacherService = {
      findTeachersByLocation: vi
        .fn()
        .mockResolvedValue([{ id: 42, name: 'Claudia', businessName: null }]),
    };
    const service = new TeacherDocumentSignatureRequestService(
      {} as never,
      {} as never,
      {} as never,
      requestRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      teacherService as never,
    );

    const { body } = await service.getAdminSignatureTrackingReport(15, {
      documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });

    expect(body).toHaveLength(2);
    expect(body.find((row) => row.summaryOnly)?.status).toBe('signed');
    expect(body.find((row) => !row.summaryOnly)?.status).toBe('not_sent');
  });
});

describe('TeacherDocumentSignatureRequestService previewTeacherDocument', () => {
  function createPreviewService(options?: { disclosure?: string | null }) {
    const timeVoucherService = {
      getTeacherTimeVoucher: vi
        .fn()
        .mockResolvedValue({ body: [], footer: { totalDuration: 0 } }),
    };
    const invoicedLessonsService = {
      getTeacherInvoicedLessons: vi.fn().mockResolvedValue({
        body: [{ invoiceDate: 'Wednesday, April 1st, 2026', lessons: [] }],
        totalCost: '$10.00',
        totalDuration: 1,
      }),
    };
    const locationService = {
      getLocationDetailsBySlug: vi
        .fn()
        .mockResolvedValue({ name: 'Studio', address: '1 St' }),
    };
    const disclosureService = {
      getDisclosureContent: vi
        .fn()
        .mockResolvedValue(
          options && 'disclosure' in options
            ? options.disclosure
            : 'Disclosure text',
        ),
    };

    const service = new TeacherDocumentSignatureRequestService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      timeVoucherService as never,
      invoicedLessonsService as never,
      locationService as never,
      {} as never,
      {} as never,
      disclosureService as never,
      {} as never,
    );

    return {
      service,
      timeVoucherService,
      invoicedLessonsService,
      locationService,
      disclosureService,
    };
  }

  it('builds a summary invoiced-lessons preview from canonical detailed data', async () => {
    const { service, invoicedLessonsService, disclosureService } =
      createPreviewService();

    const { body } = await service.previewTeacherDocument(
      'training-location',
      42,
      {
        documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        summaryOnly: true,
      },
    );

    expect(
      invoicedLessonsService.getTeacherInvoicedLessons,
    ).toHaveBeenCalledWith(
      'training-location',
      42,
      '2026-04-01',
      '2026-04-30',
      false,
    );
    expect(disclosureService.getDisclosureContent).toHaveBeenCalledWith(
      TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
    );
    expect(body.summaryOnly).toBe(true);
    expect(body.documentData).toBeTruthy();
    expect(body.locationDetails).toEqual({ name: 'Studio', address: '1 St' });
    expect(body.disclosureSnapshot).toBe('Disclosure text');
  });

  it('normalizes a missing disclosure to null and defaults summaryOnly to false', async () => {
    const { service } = createPreviewService({ disclosure: null });

    const { body } = await service.previewTeacherDocument(
      'training-location',
      42,
      {
        documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      },
    );

    expect(body.disclosureSnapshot).toBeNull();
    expect(body.summaryOnly).toBe(false);
  });

  it('builds a summary time-voucher preview from canonical detailed data', async () => {
    const { service, timeVoucherService, invoicedLessonsService } =
      createPreviewService();

    await service.previewTeacherDocument('training-location', 7, {
      documentType: TeacherDocumentSignatureRequestType.TIME_VOUCHER,
      startDate: '2026-04-01',
      endDate: '2026-04-07',
      summaryOnly: true,
    });

    expect(timeVoucherService.getTeacherTimeVoucher).toHaveBeenCalledWith(
      'training-location',
      7,
      '2026-04-01',
      '2026-04-07',
      false,
    );
    expect(
      invoicedLessonsService.getTeacherInvoicedLessons,
    ).not.toHaveBeenCalled();
  });

  it('reconstructs a legacy signed detailed view when its summary is unchanged', async () => {
    const { service, invoicedLessonsService } = createPreviewService();
    const signedSummary = {
      body: [{ date: 'July 2nd, 2026', duration: 3.25, cost: '$81.25' }],
      totalCost: '$81.25',
      totalDuration: 3.25,
    };
    const detailedData = {
      body: [
        {
          invoiceDate: 'July 2nd, 2026',
          lessons: [{ student: 'Student', duration: 3.25, cost: '$81.25' }],
        },
      ],
      totalCost: '$81.25',
      totalDuration: 3.25,
    };
    invoicedLessonsService.getTeacherInvoicedLessons.mockImplementation(
      async (_location, _teacherId, _startDate, _endDate, summaryOnly) =>
        summaryOnly
          ? {
              ...signedSummary,
              body: [
                {
                  date: 'July 3rd, 2026',
                  duration: 3.25,
                  cost: '$81.25',
                },
              ],
            }
          : detailedData,
    );
    const legacyRequest = buildRequest({
      documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
      summaryOnly: 1 as unknown as boolean,
      documentDataSnapshot: JSON.stringify(signedSummary),
    });

    const result = await service['resolveDocumentDataForRequestedMode'](
      'burlington',
      legacyRequest,
      false,
    );

    expect(result).toEqual(detailedData);
  });

  it('keeps the signed summary when legacy report data has changed', async () => {
    const { service, invoicedLessonsService } = createPreviewService();
    const signedSummary = {
      body: [{ date: 'July 2nd, 2026', duration: 3.25, cost: '$81.25' }],
      totalCost: '$81.25',
      totalDuration: 3.25,
    };
    invoicedLessonsService.getTeacherInvoicedLessons.mockResolvedValue({
      body: [{ date: 'July 2nd, 2026', duration: 4, cost: '$100.00' }],
      totalCost: '$100.00',
      totalDuration: 4,
    });
    const legacyRequest = buildRequest({
      documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
      summaryOnly: 1 as unknown as boolean,
      documentDataSnapshot: JSON.stringify(signedSummary),
    });

    const result = await service['resolveDocumentDataForRequestedMode'](
      'burlington',
      legacyRequest,
      false,
    );

    expect(result).toEqual(signedSummary);
    expect(
      invoicedLessonsService.getTeacherInvoicedLessons,
    ).toHaveBeenCalledTimes(1);
  });
});
