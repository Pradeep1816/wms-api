import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Brackets, In, IsNull, WhereExpressionBuilder } from 'typeorm';
import { DigitalEnrollmentSubmissionService } from './digital-enrollment-submission.service';
import { CreateDigitalEnrollmentSubmissionDto } from '../dto/create-digital-enrollment-submission.dto';
import { DigitalEnrollmentInvitationStatus as Status } from '../entities/digital-enrollment-invitation.entity';

describe('digital enrolment sent links', () => {
  let service: DigitalEnrollmentSubmissionService;
  let invitation: Record<string, unknown>;
  const update = vi.fn();
  const sendEmail = vi.fn();
  const query = {
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    skip: vi.fn(),
    take: vi.fn(),
    getManyAndCount: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    invitation = {
      id: 42,
      locationId: 7,
      locationSlug: 'test',
      status: Status.PENDING,
      isKiosk: false,
      submissionId: null,
      customerName: 'Test Parent',
      customerEmail: 'parent@example.com',
      emailSentAt: new Date(),
      emailLastAttemptAt: new Date(),
      emailLastError: null,
      expiresAt: new Date(Date.now() + 86400000),
      cancelledAt: null,
      cancelledByUserId: null,
    };
    for (const key of [
      'where',
      'andWhere',
      'orderBy',
      'skip',
      'take',
    ] as const) {
      query[key].mockReturnValue(query);
    }
    query.getManyAndCount.mockImplementation(async () => [[invitation], 1]);
    update.mockImplementation(async (_criteria, values) => {
      Object.assign(invitation, values);
      return { affected: 1 };
    });
    service = Object.assign(
      Object.create(DigitalEnrollmentSubmissionService.prototype),
      {
        invitationRepository: {
          findOne: vi
            .fn()
            .mockImplementation(async ({ where }) =>
              (where.id === 42 && where.locationId === 7) ||
              where.locationSlug === 'test'
                ? invitation
                : null,
            ),
          update,
          createQueryBuilder: vi.fn().mockReturnValue(query),
        },
        locationService: { getLocationId: vi.fn().mockResolvedValue(7) },
        mailerService: { sendEmail },
      },
    );
  });

  it.each([Status.PENDING, Status.EXPIRED])(
    'voids an unsubmitted %s link and records the staff member and time',
    async (status) => {
      invitation.status = status;
      await expect(service.voidInvitation(7, 42, 99)).resolves.toEqual({
        id: 42,
        status: 'voided',
      });
      expect(update).toHaveBeenCalledWith(
        {
          id: 42,
          locationId: 7,
          isKiosk: false,
          submissionId: IsNull(),
          status: In([Status.PENDING, Status.EXPIRED]),
        },
        {
          status: Status.CANCELLED,
          cancelledAt: expect.any(Date),
          cancelledByUserId: 99,
        },
      );
      expect(invitation.emailSentAt).toBeInstanceOf(Date);
    },
  );

  it('does not overwrite the original void audit on a repeated request', async () => {
    invitation.status = Status.CANCELLED;
    invitation.cancelledByUserId = 12;
    await service.voidInvitation(7, 42, 99);
    expect(update).not.toHaveBeenCalled();
    expect(invitation.cancelledByUserId).toBe(12);
  });

  it.each([
    { isKiosk: true },
    { submissionId: 123 },
    { status: Status.SUBMITTED },
  ])('protects kiosk and submitted invitations: %j', async (fields) => {
    Object.assign(invitation, fields);
    await expect(service.voidInvitation(7, 42, 99)).rejects.toThrow(
      'Only unsubmitted invitation links can be voided.',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('does not void another location’s invitation', async () => {
    await expect(service.voidInvitation(8, 42, 99)).rejects.toThrow(
      'Digital enrolment invitation not found.',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('reports an invitation that changed before the conditional update', async () => {
    update.mockResolvedValueOnce({ affected: 0 });
    await expect(service.voidInvitation(7, 42, 99)).rejects.toThrow(
      'This invitation has changed. Refresh Sent Links and try again.',
    );
  });

  it('makes voided links inactive on the public form and prevents emailing them again', async () => {
    await service.voidInvitation(7, 42, 99);
    await expect(
      service.getInvitationStatus('test', 'test-invitation'),
    ).resolves.toMatchObject({ status: Status.CANCELLED });
    await expect(service.getOptions('test', 'test-invitation')).rejects.toThrow(
      'Enrolment link is no longer active.',
    );
    await expect(
      service.create(
        'test',
        'test-invitation',
        {} as CreateDigitalEnrollmentSubmissionDto,
        {},
      ),
    ).rejects.toThrow('Enrolment link is no longer active.');
    await expect(
      service.sendInvitationEmail(7, 42, {
        enrollmentUrl: 'https://example.com/enroll/test-invitation',
      }),
    ).rejects.toThrow('This enrolment link is voided and cannot be emailed.');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each([undefined, 'non-voided', 'expired', 'failed', 'voided', 'all'])(
    'filters sent links with %s while retaining location and submission boundaries',
    async (voidFilter) => {
      await service.findSentLinksForLocation(7, {
        voidFilter,
        page: 2,
        limit: 10,
        search: 'Parent',
      });
      expect(query.where).toHaveBeenCalledWith(
        'invitation.locationId = :locationId',
        { locationId: 7 },
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        'invitation.isKiosk = :isKiosk',
        { isKiosk: false },
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        'invitation.submissionId IS NULL',
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        'invitation.status != :submitted',
        { submitted: Status.SUBMITTED },
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        '(invitation.emailSentAt IS NOT NULL OR invitation.emailLastAttemptAt IS NOT NULL)',
      );
      const cancellationCalls = query.andWhere.mock.calls.filter(
        ([condition]) =>
          typeof condition === 'string' && condition.includes(':cancelled'),
      );
      expect(cancellationCalls).toEqual(
        voidFilter === 'all'
          ? []
          : [
              [
                `invitation.status ${voidFilter === 'voided' ? '=' : '!='} :cancelled`,
                { cancelled: Status.CANCELLED },
              ],
            ],
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        '(invitation.customerName LIKE :search OR invitation.customerEmail LIKE :search)',
        { search: '%Parent%' },
      );
      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.take).toHaveBeenCalledWith(10);
    },
  );

  it('rejects an invalid filter instead of exposing a broader list', async () => {
    await expect(
      service.findSentLinksForLocation(7, { voidFilter: 'invalid' }),
    ).rejects.toThrow('Invalid sent link void filter.');
    expect(query.getManyAndCount).not.toHaveBeenCalled();
  });

  it('filters failed attempts that have never been sent successfully, excluding voided links', async () => {
    await service.findSentLinksForLocation(7, { voidFilter: 'failed' });
    expect(query.andWhere).toHaveBeenCalledWith(
      'invitation.emailSentAt IS NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "invitation.emailLastError IS NOT NULL AND invitation.emailLastError != ''",
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'invitation.status != :cancelled',
      { cancelled: Status.CANCELLED },
    );
  });

  it('finds expired links by stored status or elapsed expiry date, excluding voided links', async () => {
    await service.findSentLinksForLocation(7, { voidFilter: 'expired' });
    const brackets = query.andWhere.mock.calls.find(
      ([condition]) => condition instanceof Brackets,
    )?.[0] as Brackets;
    expect(brackets).toBeInstanceOf(Brackets);
    const expiredQuery = {
      where: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
    };
    brackets.whereFactory(expiredQuery as unknown as WhereExpressionBuilder);
    expect(expiredQuery.where).toHaveBeenCalledWith(
      'invitation.status = :expired',
      { expired: Status.EXPIRED },
    );
    expect(expiredQuery.orWhere).toHaveBeenCalledWith(
      'invitation.expiresAt < :now',
      { now: expect.any(Date) },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'invitation.status != :cancelled',
      { cancelled: Status.CANCELLED },
    );
  });

  it('shows Voided ahead of expiry or delivery failure and preserves pagination totals', async () => {
    invitation.status = Status.CANCELLED;
    invitation.expiresAt = new Date(0);
    invitation.emailSentAt = null;
    invitation.emailLastError = 'Test delivery failure';
    query.getManyAndCount.mockResolvedValueOnce([[invitation], 21]);
    const result = await service.findSentLinksForLocation(7, {
      voidFilter: 'all',
      limit: 10,
    });
    expect(result.body[0].status).toBe('voided');
    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
  });
});
