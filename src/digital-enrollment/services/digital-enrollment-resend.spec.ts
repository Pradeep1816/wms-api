import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { DigitalEnrollmentSubmissionService } from './digital-enrollment-submission.service';
import {
  DigitalEnrollmentInvitation,
  DigitalEnrollmentInvitationStatus as Status,
} from '../entities/digital-enrollment-invitation.entity';

describe('resend failed digital enrolment invitations', () => {
  let service: DigitalEnrollmentSubmissionService;
  let invitation: DigitalEnrollmentInvitation;
  const findOne = vi.fn();
  const save = vi.fn();
  const update = vi.fn();
  const transaction = vi.fn();
  const sendEmail = vi.fn();
  const getLocationDetails = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BASE_URL', 'https://school.example.com/v2');
    invitation = Object.assign(new DigitalEnrollmentInvitation(), {
      id: 42,
      locationId: 7,
      locationSlug: 'test',
      status: Status.PENDING,
      tokenHash: 'original-hash',
      isKiosk: false,
      submissionId: null,
      customerName: 'Test Parent',
      customerEmail: 'parent@example.com',
      emailSentAt: null,
      emailLastError: 'Test mail failure',
      emailLastAttemptAt: new Date(0),
      expiresAt: new Date(0),
    });
    findOne.mockImplementation(async ({ where }) =>
      where.locationId === 7 && where.id === 42 ? invitation : null,
    );
    save.mockImplementation(async (value) => {
      invitation = value;
      return value;
    });
    update.mockImplementation(async (_criteria, values) => {
      Object.assign(invitation, values);
      return { affected: 1 };
    });
    const repository = { findOne, save, update, manager: { transaction } };
    transaction.mockImplementation(async (callback) =>
      callback({ getRepository: () => repository }),
    );
    sendEmail.mockResolvedValue(undefined);
    getLocationDetails.mockResolvedValue({ email: 'desk@example.com' });
    service = Object.assign(
      Object.create(DigitalEnrollmentSubmissionService.prototype),
      {
        invitationRepository: repository,
        mailerService: { sendEmail },
        locationRepository: { getLocationDetails },
      },
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([Status.PENDING, Status.EXPIRED])(
    'retries a failed %s invitation with a fresh usable link and 14-day expiry',
    async (status) => {
      invitation.status = status;
      const before = Date.now();
      await expect(service.resendInvitationEmail(7, 42)).resolves.toEqual({
        id: 42,
        sent: true,
        to: ['parent@example.com'],
      });
      expect(findOne).toHaveBeenCalledWith({
        where: { id: 42, locationId: 7 },
        lock: { mode: 'pessimistic_write' },
      });
      expect(invitation.status).toBe(Status.PENDING);
      expect(invitation.emailSentAt).toBeInstanceOf(Date);
      expect(invitation.emailLastError).toBeNull();
      expect(invitation.expiresAt?.getTime()).toBeGreaterThanOrEqual(
        before + 14 * 86400000,
      );
      const email = sendEmail.mock.calls[0][0];
      expect(email).toMatchObject({
        from: 'desk@example.com',
        replyTo: 'desk@example.com',
        to: ['parent@example.com'],
      });
      const href = email.html.match(
        /href="(https:\/\/school\.example\.com\/v2\/enroll\/test\/[^" ]+)"/,
      )?.[1];
      expect(href).toBeTruthy();
      const token = new URL(href).pathname.split('/').pop()!;
      expect(createHash('sha256').update(token).digest('hex')).toBe(
        invitation.tokenHash,
      );
      expect(invitation.tokenHash).not.toBe('original-hash');
    },
  );

  it('commits the latest failure audit, surfaces the error, and permits another retry', async () => {
    sendEmail.mockRejectedValueOnce(new Error('Test SMTP unavailable'));
    await expect(service.resendInvitationEmail(7, 42)).rejects.toThrow(
      'Test SMTP unavailable',
    );
    await expect(transaction.mock.results[0].value).resolves.toHaveProperty(
      'error',
    );
    expect(invitation.emailLastError).toBe('Test SMTP unavailable');
    expect(invitation.emailLastAttemptAt).toBeInstanceOf(Date);
    expect(invitation.emailSentAt).toBeNull();
    await expect(service.resendInvitationEmail(7, 42)).resolves.toMatchObject({
      sent: true,
    });
    expect(invitation.emailLastError).toBeNull();
  });

  it.each([
    { status: Status.CANCELLED },
    { status: Status.SUBMITTED },
    { submissionId: 123 },
    { isKiosk: true },
    { emailSentAt: new Date() },
    { emailLastError: null },
  ])('rejects ineligible invitations: %j', async (fields) => {
    Object.assign(invitation, fields);
    await expect(service.resendInvitationEmail(7, 42)).rejects.toThrow(
      'Only failed, unsubmitted invitation emails can be resent.',
    );
    expect(save).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not retry another location’s invitation', async () => {
    await expect(service.resendInvitationEmail(8, 42)).rejects.toThrow(
      'Digital enrolment invitation not found.',
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a repeated request after a successful retry without replacing the working link', async () => {
    await service.resendInvitationEmail(7, 42);
    const workingHash = invitation.tokenHash;
    await expect(service.resendInvitationEmail(7, 42)).rejects.toThrow(
      'Only failed, unsubmitted invitation emails can be resent.',
    );
    expect(invitation.tokenHash).toBe(workingHash);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('requires a configured application URL before replacing a link', async () => {
    vi.stubEnv('BASE_URL', '');
    await expect(service.resendInvitationEmail(7, 42)).rejects.toThrow(
      'The application URL must be configured before resending enrolment links.',
    );
    expect(save).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('records a configuration failure without losing the failed status', async () => {
    getLocationDetails.mockResolvedValueOnce({ email: '' });
    await expect(service.resendInvitationEmail(7, 42)).rejects.toThrow(
      'Location email is required',
    );
    expect(invitation.emailLastError).toContain('Location email is required');
    expect(invitation.emailSentAt).toBeNull();
  });

  it('preserves the initial-send flow and updates only delivery metadata', async () => {
    await service.sendInvitationEmail(7, 42, {
      enrollmentUrl: 'https://school.example.com/v2/enroll/test/original',
    });
    expect(invitation.tokenHash).toBe('original-hash');
    expect(invitation.emailSentAt).toBeInstanceOf(Date);
    expect(invitation.emailLastError).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      { id: 42 },
      {
        emailSentAt: expect.any(Date),
        emailLastAttemptAt: expect.any(Date),
        emailLastError: null,
      },
    );
  });
});
