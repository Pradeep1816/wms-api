import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DigitalEnrollmentAdminController } from '../controllers/digital-enrollment-submission.controller';
import {
  DigitalEnrollmentSubmission,
  DigitalEnrollmentSubmissionStatus as Status,
} from '../entities/digital-enrollment-submission.entity';
import { DigitalEnrollmentSubmissionService } from './digital-enrollment-submission.service';

describe('digital enrolment manual completion', () => {
  let service: DigitalEnrollmentSubmissionService;
  let stored: DigitalEnrollmentSubmission;
  const confirmEnrollment = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    confirmEnrollment.mockClear();
    stored = Object.assign(new DigitalEnrollmentSubmission(), {
      id: 42,
      locationId: 7,
      status: Status.REVIEWING,
      completionNote: null,
      convertedAt: null,
      linkedCustomerId: null,
      linkedStudentId: null,
      linkedEnrolmentId: null,
    });
    service = Object.assign(
      Object.create(DigitalEnrollmentSubmissionService.prototype),
      {
        submissionRepository: {
          findOne: vi
            .fn()
            .mockImplementation(async ({ where }) =>
              where.id === stored.id && where.locationId === stored.locationId
                ? { ...stored }
                : null,
            ),
          save: vi.fn().mockImplementation(async (submission) => {
            stored = { ...submission };
            return stored;
          }),
        },
        enrolmentRepository: {
          update: confirmEnrollment,
          findOne: vi
            .fn()
            .mockResolvedValue({
              id: 123,
              studentId: 20,
              courseId: 5,
              isConfirmed: 1,
              isDeleted: 0,
            }),
        },
        locationRepository: {
          getLocationDetails: vi.fn().mockResolvedValue({}),
        },
        enrolmentPolicyService: {
          resolveSignedPolicySections: vi.fn().mockResolvedValue([]),
        },
        getEnrollmentPackageDetails: vi.fn().mockResolvedValue(null),
        buildAdditionalStudentsResponse: vi.fn().mockResolvedValue([]),
        captureEnrollmentPackageSnapshot: vi.fn().mockResolvedValue({}),
      },
    );
  });

  it('saves a note without record links and returns it when the detail is reloaded', async () => {
    const controller = new DigitalEnrollmentAdminController(service);
    await controller.updateStatus(7, 42, {
      status: Status.CONVERTED,
      completionNote:
        '  Student Tom Brown’s enrolment has been marked as completed.  ',
    });

    const detail = await service.findOneForLocation(7, 42);
    expect(detail.status).toBe(Status.CONVERTED);
    expect(detail.completionNote).toBe(
      'Student Tom Brown’s enrolment has been marked as completed.',
    );
    expect(detail.convertedAt).toBeInstanceOf(Date);
    expect(detail.linkedEnrolmentId).toBeNull();
    expect(confirmEnrollment).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '   '])(
    'allows completion without records or a note: %s',
    async (note) => {
      const detail = await service.updateStatus(7, 42, Status.CONVERTED, note);
      expect(detail.status).toBe(Status.CONVERTED);
      expect(detail.completionNote).toBeNull();
      expect(detail.convertedAt).toBeInstanceOf(Date);
      expect(confirmEnrollment).not.toHaveBeenCalled();
    },
  );

  it('preserves the existing record links and confirmation behaviour', async () => {
    stored.linkedCustomerId = 10;
    stored.linkedStudentId = 20;
    stored.linkedEnrolmentId = 123;
    const detail = await service.updateStatus(7, 42, Status.CONVERTED);

    expect(detail).toMatchObject({
      linkedCustomerId: 10,
      linkedStudentId: 20,
      linkedEnrolmentId: 123,
    });
    expect(confirmEnrollment).toHaveBeenCalledWith(
      { id: 123 },
      { isConfirmed: 1 },
    );
  });

  it('retains a saved note through status-only requests and ignores notes on other statuses', async () => {
    await service.updateStatus(
      7,
      42,
      Status.CONVERTED,
      'Completed at the front desk.',
    );
    const completedAt = stored.convertedAt;
    await service.updateStatus(
      7,
      42,
      Status.REVIEWING,
      'Should not replace the completion note.',
    );
    const detail = await service.updateStatus(7, 42, Status.CONVERTED);

    expect(detail.completionNote).toBe('Completed at the front desk.');
    expect(detail.convertedAt).toEqual(completedAt);
  });

  it('does not complete a submission from another location', async () => {
    await expect(
      service.updateStatus(8, 42, Status.CONVERTED, 'Completed.'),
    ).rejects.toThrow('Digital enrolment submission not found.');
    expect(stored.status).toBe(Status.REVIEWING);
    expect(stored.completionNote).toBeNull();
  });

  const recordActions: Array<
    [string, (service: DigitalEnrollmentSubmissionService) => Promise<unknown>]
  > = [
    [
      'create/link customer',
      (s) => s.linkOrCreateCustomer('test', 7, 42, {}, 99),
    ],
    ['unlink customer', (s) => s.unlinkCustomer(7, 42)],
    [
      'create/link student',
      (s) => s.linkOrCreateStudent('test', 7, 42, {}, 99),
    ],
    ['unlink student', (s) => s.unlinkStudent(7, 42)],
    ['create enrolment', (s) => s.createEnrollment('test', 7, 42, 99)],
    ['link enrolment', (s) => s.linkEnrollment(7, 42, { enrolmentId: 123 })],
    [
      'create/link additional student',
      (s) => s.createAdditionalStudent('test', 7, 42, 0, 99),
    ],
    ['unlink additional student', (s) => s.unlinkAdditionalStudent(7, 42, 0)],
    [
      'link additional enrolment',
      (s) => s.linkAdditionalStudentEnrolment(7, 42, 0, 123),
    ],
  ];

  describe.each([
    [Status.CONVERTED, false],
    [Status.REJECTED, false],
    [Status.SUBMITTED, true],
    [Status.REVIEWING, true],
    [Status.CONVERTED, true],
    [Status.REJECTED, true],
  ] as const)('closed state %s, voided=%s', (status, voided) => {
    it.each(recordActions)(
      'blocks %s before changing any records',
      async (_name, action) => {
        stored.status = status;
        stored.voidedAt = voided ? new Date() : null;
        const before = { ...stored };
        await expect(action(service)).rejects.toThrow(
          'Mark this digital enrolment Reviewing before creating, linking or unlinking records.',
        );
        expect(stored).toEqual(before);
        expect(confirmEnrollment).not.toHaveBeenCalled();
      },
    );

    it('allows reading the closed submission', async () => {
      stored.status = status;
      stored.voidedAt = voided ? new Date() : null;
      await expect(service.findOneForLocation(7, 42)).resolves.toMatchObject({
        status,
      });
    });

    it('reopens as Reviewing and permits record changes again', async () => {
      stored.status = status;
      stored.voidedAt = voided ? new Date() : null;
      stored.voidReason = voided ? 'Duplicate' : null;
      stored.voidedByUserId = voided ? 99 : null;
      stored.linkedCustomerId = 10;
      stored.linkedStudentId = 20;
      stored.completionNote = 'Previously completed at the front desk.';

      const reopened = await service.updateStatus(7, 42, Status.REVIEWING);
      expect(reopened).toMatchObject({
        status: Status.REVIEWING,
        isVoided: false,
        voidReason: null,
        voidedByUserId: null,
      });
      await service.unlinkCustomer(7, 42);
      expect(stored.linkedCustomerId).toBeNull();
      expect(stored.linkedStudentId).toBeNull();
      expect(stored.completionNote).toBe(
        'Previously completed at the front desk.',
      );
    });
  });

  it.each([Status.SUBMITTED, Status.REVIEWING])(
    'keeps initial record processing available in %s',
    async (status) => {
      stored.status = status;
      stored.linkedCustomerId = 10;
      await service.unlinkCustomer(7, 42);
      expect(stored.linkedCustomerId).toBeNull();
    },
  );

  it('restores a voided completed submission to Reviewing', async () => {
    stored.status = Status.CONVERTED;
    stored.voidedAt = new Date();
    stored.voidReason = 'Duplicate';
    stored.voidedByUserId = 99;
    const restored = await service.restoreSubmission(7, 42);
    expect(restored).toMatchObject({
      status: Status.REVIEWING,
      isVoided: false,
      voidReason: null,
      voidedByUserId: null,
    });
  });

  it('supports linking an enrolment then saving the completion note in the existing completion flow', async () => {
    stored.linkedCustomerId = 10;
    stored.linkedStudentId = 20;
    await service.linkEnrollment(7, 42, { enrolmentId: 123 });
    expect(stored.status).toBe(Status.CONVERTED);
    const completed = await service.updateStatus(
      7,
      42,
      Status.CONVERTED,
      'Confirmed at the front desk.',
    );
    expect(completed).toMatchObject({
      linkedEnrolmentId: 123,
      completionNote: 'Confirmed at the front desk.',
    });
  });

  it('allows an additional student enrolment after explicitly reopening a completed family submission', async () => {
    stored.status = Status.CONVERTED;
    stored.additionalStudentsData = [
      { fullName: 'Another Student', linkedStudentId: 20 },
    ];
    await service.updateStatus(7, 42, Status.REVIEWING);
    await service.linkAdditionalStudentEnrolment(7, 42, 0, 123);
    expect(stored.additionalStudentsData?.[0]).toMatchObject({
      linkedStudentId: 20,
      linkedEnrolmentId: 123,
    });
    expect(stored.status).toBe(Status.REVIEWING);
  });
});
