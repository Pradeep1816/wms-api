import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { LocationService } from '../../location/services/location.service';
import { ProgramService } from '../../program/program.service';
import { TeacherService } from '../../teacher/services/teacher.service';
import { CustomerService } from '../../customer/services/customer.service';
import { CustomersInfoAddressRepository } from '../../customer/repositories/customers-info-address.repository';
import { CustomersInfoEmailRepository } from '../../customer/repositories/customers-info-email.repository';
import { CustomersInfoPhoneRepository } from '../../customer/repositories/customers-info-phone.repository';
import { StudentService } from '../../student/services/student.service';
import { CustomerStudentsRequestDto } from '../../student/dto/customer-students-request.dto';
import { User } from '../../user/entities/user.entity';
import { StudentEnrolmentService } from '../../student/services/student-enrolment.service';
import { CreateStudentEnrolmentDto } from '../../student/dto/create-student-enrolment.dto';
import {
  CreateDigitalEnrollmentInvitationDto,
  CreateDigitalEnrollmentSubmissionDto,
  LinkDigitalEnrollmentCustomerDto,
  LinkDigitalEnrollmentEnrolmentDto,
  LinkDigitalEnrollmentStudentDto,
  SendDigitalEnrollmentInvitationEmailDto,
  SendDigitalEnrollmentEmailDto,
  UpdateDigitalEnrollmentPaymentAmountsDto,
} from '../dto/create-digital-enrollment-submission.dto';
import {
  DigitalEnrollmentInvitation,
  DigitalEnrollmentInvitationStatus,
} from '../entities/digital-enrollment-invitation.entity';
import {
  DigitalEnrollmentPaymentMethod,
  DigitalEnrollmentSubmission,
  DigitalEnrollmentSubmissionSource,
  DigitalEnrollmentSubmissionStatus,
} from '../entities/digital-enrollment-submission.entity';
import { LocationRepository } from '../../location/repositories/location.repository';
import { MailerService } from '../../shared/services/mailer.service';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { City } from '../../location/entities/city.entity';
import { Province } from '../../location/entities/province.entity';
import { Country } from '../../location/entities/country.entity';
import { EnrolmentPolicyService } from './enrolment-policy.service';
import { Program } from '../../program/entities/program.entity';
import { PricingResolverService } from '../../pricing/services/pricing-resolver.service';
import { ProgramPresentationService } from '../../pricing/services/program-presentation.service';
import { DEFAULT_PRICING_TIER } from '../../pricing/services/enrolment-tier.service';
import { PricingRolloutService } from '../../pricing/services/pricing-rollout.service';
import { RoundingUtils } from '../../utils/rounding.utils';

const requiredPolicyKeys = ['policies_acknowledged'];

const paymentPreferenceEmailLabels: Record<string, string> = {
  monthly: 'Monthly Pre-Authorized Payment',
  'three-month': '3 Month Advanced Payment (3% discount)',
  'six-month': '6 Month Advanced Payment (6% discount)',
  'twelve-month': '12 Month Advanced Payment (10% discount)',
};

export interface DigitalEnrollmentPackageDetails {
  enrolmentId: number;
  courseId: number | null;
  programName: string;
  teacherName: string;
  day: string;
  time: string;
  duration: string;
  startDate: string;
  endDate: string;
  paymentFrequency: string;
  paymentFrequencyLength: number;
  lessonRate: number;
  lessonsCount: number;
  isOnline: boolean;
  discounts: any;
  paymentEmail: string;
  locationPhone: string;
  locationAddress: string;
}

export interface CreateDigitalEnrollmentSubmissionMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface FindDigitalEnrollmentSubmissionsQuery {
  page?: string | number;
  limit?: string | number;
  status?: string;
  student?: string;
  guardian?: string;
  email?: string;
  instrument?: string;
  linkedCustomerId?: string;
  submittedFrom?: string;
  submittedTo?: string;
  sort?: string;
  order?: string;
}

@Injectable()
export class DigitalEnrollmentSubmissionService {
  private readonly logger = new Logger(DigitalEnrollmentSubmissionService.name);

  /**
   * Default editable intro for the invitation email. The standard closing
   * (reminders + sign-off) is fixed in buildInvitationEmailHtml so every
   * location sends consistent wording; the front desk can override only this
   * intro per send.
   */
  private static readonly DEFAULT_INVITATION_INTRO =
    'Thank you for choosing Arcadia Academy of Music!\n\nTo get started, please complete our secure online registration form using the link below:';

  constructor(
    @InjectRepository(DigitalEnrollmentSubmission)
    private readonly submissionRepository: Repository<DigitalEnrollmentSubmission>,
    @InjectRepository(DigitalEnrollmentInvitation)
    private readonly invitationRepository: Repository<DigitalEnrollmentInvitation>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly locationService: LocationService,
    private readonly programService: ProgramService,
    private readonly teacherService: TeacherService,
    private readonly locationRepository: LocationRepository,
    private readonly mailerService: MailerService,
    private readonly customerService: CustomerService,
    private readonly customersInfoAddressRepository: CustomersInfoAddressRepository,
    private readonly customersInfoEmailRepository: CustomersInfoEmailRepository,
    private readonly customersInfoPhoneRepository: CustomersInfoPhoneRepository,
    private readonly studentService: StudentService,
    private readonly studentEnrolmentService: StudentEnrolmentService,
    private readonly enrolmentPolicyService: EnrolmentPolicyService,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(Province)
    private readonly provinceRepository: Repository<Province>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    private readonly pricingResolver: PricingResolverService,
    private readonly programPresentation: ProgramPresentationService,
    private readonly pricingRollout: PricingRolloutService,
  ) {}

  async createInvitation(locationSlug: string, dto: CreateDigitalEnrollmentInvitationDto, createdByUserId: number) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const locationId = await this.locationService.getLocationId(normalizedLocation);
    const token = randomBytes(32).toString('base64url');
    const expiresInDays = dto.expiresInDays && dto.expiresInDays > 0 ? dto.expiresInDays : 14;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const invitation = new DigitalEnrollmentInvitation();
    invitation.locationId = locationId;
    invitation.locationSlug = normalizedLocation;
    invitation.tokenHash = this.hashToken(token);
    invitation.status = DigitalEnrollmentInvitationStatus.PENDING;
    invitation.customerEmail = dto.customerEmail?.trim() || null;
    invitation.customerName = dto.customerName?.trim() || null;
    invitation.expiresAt = expiresAt;
    invitation.submittedAt = null;
    invitation.submissionId = null;
    invitation.createdByUserId = createdByUserId;
    invitation.cancelledAt = null;
    invitation.cancelledByUserId = null;

    const saved = await this.invitationRepository.save(invitation);

    return {
      id: saved.id,
      token,
      locationSlug: saved.locationSlug,
      status: saved.status,
      expiresAt: saved.expiresAt,
      path: `/v2/enroll/${saved.locationSlug}/${token}`,
    };
  }

  /**
   * Create (or re-PIN) the location's single permanent kiosk link. The raw token
   * is stored so the front desk can always retrieve the URL; access is PIN-gated.
   */
  async setupKioskInvitation(locationSlug: string, pin: string, userId: number) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const locationId = await this.locationService.getLocationId(normalizedLocation);

    let invitation = await this.invitationRepository.findOne({
      where: { locationId, isKiosk: true },
    });

    if (!invitation) {
      const token = randomBytes(32).toString('base64url');
      invitation = new DigitalEnrollmentInvitation();
      invitation.locationId = locationId;
      invitation.locationSlug = normalizedLocation;
      invitation.tokenHash = this.hashToken(token);
      invitation.kioskToken = token;
      invitation.status = DigitalEnrollmentInvitationStatus.PENDING;
      invitation.isKiosk = true;
      invitation.customerEmail = null;
      invitation.customerName = 'Studio kiosk';
      invitation.expiresAt = null;
      invitation.submittedAt = null;
      invitation.submissionId = null;
      invitation.createdByUserId = userId;
      invitation.cancelledAt = null;
      invitation.cancelledByUserId = null;
    }

    invitation.pinHash = this.hashToken(pin.trim());
    const saved = await this.invitationRepository.save(invitation);

    return {
      exists: true,
      path: saved.kioskToken ? `/v2/enroll/${saved.locationSlug}/${saved.kioskToken}` : null,
      hasPin: Boolean(saved.pinHash),
    };
  }

  async getKioskInvitation(locationSlug: string) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const locationId = await this.locationService.getLocationId(normalizedLocation);
    const invitation = await this.invitationRepository.findOne({
      where: { locationId, isKiosk: true },
    });

    if (!invitation) {
      return { exists: false, path: null, hasPin: false };
    }

    return {
      exists: true,
      path: invitation.kioskToken ? `/v2/enroll/${invitation.locationSlug}/${invitation.kioskToken}` : null,
      hasPin: Boolean(invitation.pinHash),
    };
  }

  async verifyKioskPin(locationSlug: string, token: string, pin: string) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const invitation = await this.invitationRepository.findOne({
      where: { locationSlug: normalizedLocation, tokenHash: this.hashToken(token.trim()) },
    });

    if (!invitation || !invitation.isKiosk) {
      throw new NotFoundException('Kiosk link not found.');
    }

    const valid = Boolean(invitation.pinHash) && invitation.pinHash === this.hashToken(pin.trim());
    return { valid };
  }

  async voidInvitation(locationId: number, invitationId: number, userId: number) {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId, locationId },
    });
    if (!invitation) {
      throw new NotFoundException('Digital enrolment invitation not found.');
    }
    if (invitation.isKiosk || invitation.submissionId || invitation.status === DigitalEnrollmentInvitationStatus.SUBMITTED) {
      throw new BadRequestException('Only unsubmitted invitation links can be voided.');
    }
    if (invitation.status === DigitalEnrollmentInvitationStatus.CANCELLED) {
      return { id: invitation.id, status: 'voided' };
    }

    const result = await this.invitationRepository.update(
      {
        id: invitationId,
        locationId,
        isKiosk: false,
        submissionId: IsNull(),
        status: In([DigitalEnrollmentInvitationStatus.PENDING, DigitalEnrollmentInvitationStatus.EXPIRED]),
      },
      {
        status: DigitalEnrollmentInvitationStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: userId,
      },
    );
    if (!result.affected) {
      throw new BadRequestException('This invitation has changed. Refresh Sent Links and try again.');
    }
    return { id: invitation.id, status: 'voided' };
  }

  async sendInvitationEmail(
    locationId: number,
    invitationId: number,
    dto: SendDigitalEnrollmentInvitationEmailDto,
  ) {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId, locationId },
    });

    if (!invitation) {
      throw new NotFoundException('Digital enrolment invitation not found.');
    }

    if (invitation.status === DigitalEnrollmentInvitationStatus.CANCELLED) {
      throw new BadRequestException('This enrolment link is voided and cannot be emailed.');
    }

    return this.deliverInvitationEmail(invitation, dto, this.invitationRepository);
  }

  async resendInvitationEmail(locationId: number, invitationId: number) {
    const baseUrl = process.env.BASE_URL?.trim();
    let origin: URL;
    try {
      origin = new URL(baseUrl || '');
      if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Invalid protocol');
    } catch {
      throw new BadRequestException('The application URL must be configured before resending enrolment links.');
    }

    // Serialize retries for this invitation, so concurrent requests cannot send
    // different links and invalidate an email that just succeeded.
    const outcome = await this.invitationRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(DigitalEnrollmentInvitation);
      const invitation = await repository.findOne({
        where: { id: invitationId, locationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) throw new NotFoundException('Digital enrolment invitation not found.');
      if (
        invitation.isKiosk || invitation.submissionId || invitation.emailSentAt || !invitation.emailLastError ||
        ![DigitalEnrollmentInvitationStatus.PENDING, DigitalEnrollmentInvitationStatus.EXPIRED].includes(invitation.status)
      ) {
        throw new BadRequestException('Only failed, unsubmitted invitation emails can be resent.');
      }

      const token = randomBytes(32).toString('base64url');
      invitation.tokenHash = this.hashToken(token);
      invitation.status = DigitalEnrollmentInvitationStatus.PENDING;
      invitation.expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await repository.save(invitation);
      const enrollmentUrl = new URL(`/v2/enroll/${encodeURIComponent(invitation.locationSlug)}/${token}`, origin).toString();
      try {
        const result = await this.deliverInvitationEmail(invitation, { enrollmentUrl }, repository);
        return { result };
      } catch (error) {
        // Commit the failure audit even when recipient/configuration validation fails.
        await repository.update({ id: invitation.id }, {
          emailLastAttemptAt: new Date(),
          emailLastError: (error instanceof Error ? error.message : 'Failed to resend enrolment link email.').slice(0, 500),
        });
        return { error };
      }
    });
    if ('error' in outcome) throw outcome.error;
    return outcome.result;
  }

  private async deliverInvitationEmail(
    invitation: DigitalEnrollmentInvitation,
    dto: SendDigitalEnrollmentInvitationEmailDto,
    repository: Repository<DigitalEnrollmentInvitation>,
  ) {

    const recipient = invitation.customerEmail?.trim();
    if (!recipient) {
      throw new BadRequestException('Parent or guardian email is required before sending the enrolment link.');
    }

    const location = await this.locationRepository.getLocationDetails(invitation.locationId);
    const locationEmail = typeof location?.email === 'string' ? location.email.trim() : '';

    if (!locationEmail) {
      throw new BadRequestException('Location email is required before sending enrolment link email.');
    }

    const recipients = this.normalizeEmails([recipient]);
    if (!recipients.length) {
      throw new BadRequestException('At least one recipient email is required.');
    }

    try {
      await this.mailerService.sendEmail({
        from: locationEmail,
        replyTo: locationEmail,
        to: recipients,
        subject: 'Welcome to Arcadia Academy of Music – Complete Your Registration',
        html: this.buildInvitationEmailHtml(invitation, dto.enrollmentUrl, dto.message),
      });
    } catch (error) {
      // Record the failed attempt + reason so it shows as "Send failed" on the
      // Sent Links tab and can be retried, then surface the error to the caller.
      invitation.emailLastAttemptAt = new Date();
      invitation.emailLastError = (
        error instanceof Error ? error.message : 'Failed to send enrolment link email.'
      ).slice(0, 500);
      await repository.update({ id: invitation.id }, {
        emailLastAttemptAt: invitation.emailLastAttemptAt,
        emailLastError: invitation.emailLastError,
      });
      throw error;
    }

    // Record that the link was emailed so it can be surfaced on the Sent Links tab.
    const sentAt = new Date();
    invitation.emailSentAt = sentAt;
    invitation.emailLastAttemptAt = sentAt;
    invitation.emailLastError = null;
    await repository.update({ id: invitation.id }, {
      emailSentAt: invitation.emailSentAt,
      emailLastAttemptAt: invitation.emailLastAttemptAt,
      emailLastError: null,
    });

    return {
      id: invitation.id,
      sent: true,
      to: recipients,
    };
  }

  async getOptions(locationSlug: string, token: string, programId?: number) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const locationId = await this.locationService.getLocationId(normalizedLocation);
    await this.validateInvitation(normalizedLocation, token);
    const programs = await this.programService.findAll('private');
    const teachersResponse = programId
      ? await this.teacherService.findTeachersByLocationAndProgram(locationId, programId)
      : { body: await this.teacherService.findTeachersByLocation(locationId) };

    const geo = await this.getEnrolmentGeoOptions(locationId);

    return {
      programs: programs.map((program) => ({
        id: program.id,
        name: program.name,
        rate: program.rate ?? null,
      })),
      teachers: teachersResponse.body.map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
      })),
      ...geo,
    };
  }

  /**
   * Address dropdown data for the customer-facing enrolment form. Cities carry
   * their provinceId and provinces their countryId so the form can cascade the
   * selection (choosing a city selects its province, which selects its country)
   * exactly the way the tables are linked. Defaults come from the studio the
   * customer is enrolling at, so the province/country start on the sensible value
   * for that location. These lists are curated in the admin City/Province/Country
   * screens; the form only lets customers pick from them (it never creates new
   * geo records).
   */
  private async getEnrolmentGeoOptions(locationId: number) {
    const [cities, provinces, countries, location] = await Promise.all([
      this.cityRepository.find({
        where: { isDeleted: false },
        select: { id: true, name: true, provinceId: true },
        order: { name: 'ASC' },
      }),
      this.provinceRepository.find({
        select: { id: true, name: true, countryId: true },
        order: { name: 'ASC' },
      }),
      this.countryRepository.find({
        select: { id: true, name: true },
        order: { name: 'ASC' },
      }),
      this.locationRepository.getLocationDetails(locationId),
    ]);

    return {
      cities: cities.map((city) => ({
        id: city.id,
        name: city.name,
        provinceId: city.provinceId,
      })),
      provinces: provinces.map((province) => ({
        id: province.id,
        name: province.name,
        countryId: province.countryId,
      })),
      countries: countries.map((country) => ({
        id: country.id,
        name: country.name,
      })),
      defaultCityId: location?.cityId ?? null,
      defaultProvinceId: location?.provinceId ?? null,
      defaultCountryId: location?.countryId ?? null,
    };
  }

  async getInvitationStatus(locationSlug: string, token: string) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      throw new BadRequestException('Enrolment token is required.');
    }

    const invitation = await this.invitationRepository.findOne({
      where: {
        locationSlug: normalizedLocation,
        tokenHash: this.hashToken(normalizedToken),
      },
    });

    if (!invitation) {
      throw new NotFoundException('Enrolment link not found.');
    }

    if (invitation.isKiosk) {
      return {
        status: 'kiosk',
        mode: 'kiosk',
        requiresPin: Boolean(invitation.pinHash),
        submissionId: null,
        submittedAt: null,
        expiresAt: null,
        primaryEmail: null,
      };
    }

    if (
      invitation.status === DigitalEnrollmentInvitationStatus.PENDING &&
      invitation.expiresAt &&
      invitation.expiresAt.getTime() < Date.now()
    ) {
      invitation.status = DigitalEnrollmentInvitationStatus.EXPIRED;
      await this.invitationRepository.save(invitation);
    }

    let primaryEmail: string | null = invitation.customerEmail ?? null;
    if (invitation.submissionId) {
      const submission = await this.submissionRepository.findOne({
        where: { id: invitation.submissionId },
      });
      primaryEmail = String(submission?.guardianData?.primaryEmail ?? primaryEmail ?? '').trim() || null;
    }

    return {
      status: invitation.status,
      submissionId: invitation.submissionId,
      submittedAt: invitation.submittedAt,
      expiresAt: invitation.expiresAt,
      primaryEmail,
    };
  }

  async create(locationSlug: string, token: string, dto: CreateDigitalEnrollmentSubmissionDto, meta: CreateDigitalEnrollmentSubmissionMeta) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      throw new BadRequestException('Enrolment token is required.');
    }

    const invitation = await this.validateInvitation(normalizedLocation, normalizedToken);

    if (invitation.isKiosk) {
      const pin = (dto.kioskPin ?? '').trim();
      if (!invitation.pinHash || this.hashToken(pin) !== invitation.pinHash) {
        throw new UnauthorizedException('Invalid kiosk PIN.');
      }
    }

    this.validatePolicyAcknowledgements(dto.policies);
    this.validateContact(dto);

    const locationId = await this.locationService.getLocationId(normalizedLocation);
    const submittedAt = new Date();

    const submission = new DigitalEnrollmentSubmission();
    submission.locationId = locationId;
    submission.locationSlug = normalizedLocation;
    submission.token = normalizedToken;
    // Per-submission token for the public package link. `token` above can be the
    // shared kiosk token, so it cannot identify one submission — this always can.
    submission.packageToken = this.generatePackageToken();
    submission.status = DigitalEnrollmentSubmissionStatus.SUBMITTED;
    submission.studentData = dto.student as unknown as Record<string, unknown>;
    submission.guardianData = dto.guardians as unknown as Record<string, unknown>;
    submission.programPreferenceData = (dto.programPreference ?? {}) as unknown as Record<string, unknown>;
    submission.schedulePreferenceData = (dto.schedulePreference ?? {}) as unknown as Record<string, unknown>;
    submission.feeSnapshotData = (dto.feeSnapshot ?? {}) as unknown as Record<string, unknown>;
    submission.parentPreferenceData = (dto.parentPreference ?? {}) as unknown as Record<string, unknown>;
    submission.additionalStudentsData = (dto.additionalStudents ?? []) as unknown as Array<
      Record<string, unknown>
    >;
    submission.policyAcknowledgementData = dto.policies;
    // Snapshot server-side, not from the client, so the stored copy cannot be tampered with.
    submission.policySnapshot = await this.enrolmentPolicyService.getActivePolicySnapshot();
    submission.signaturePrintedName = dto.signature.printedName;
    submission.signatureSignedDate = dto.signature.signedDate;
    submission.signatureDataUrl = dto.signature.dataUrl;
    submission.submittedIpAddress = meta.ipAddress?.slice(0, 64) ?? null;
    submission.submittedUserAgent = meta.userAgent?.slice(0, 512) ?? null;
    submission.submittedAt = submittedAt;
    submission.reviewedAt = null;
    submission.linkedCustomerId = null;
    submission.linkedStudentId = null;
    submission.linkedEnrolmentId = null;
    submission.linkedCourseId = null;
    submission.convertedAt = null;
    submission.submissionSource = invitation.isKiosk
      ? DigitalEnrollmentSubmissionSource.KIOSK
      : DigitalEnrollmentSubmissionSource.INVITATION;

    const saved = await this.submissionRepository.save(submission);
    // Kiosk links are reusable: never consume them, so the next walk-in gets a fresh form.
    if (!invitation.isKiosk) {
      invitation.status = DigitalEnrollmentInvitationStatus.SUBMITTED;
      invitation.submittedAt = saved.submittedAt;
      invitation.submissionId = saved.id;
      await this.invitationRepository.save(invitation);
    }

    // Notify the front desk that a new form arrived. Best-effort: a mail failure
    // must never fail the customer's submission.
    try {
      await this.sendNewSubmissionAlert(normalizedLocation, locationId, saved);
    } catch (error) {
      this.logger.error(
        `Failed to send new-submission alert for submission #${saved.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      id: saved.id,
      status: saved.status,
      submittedAt: saved.submittedAt,
    };
  }

  async findOneForLocation(locationId: number, id: number) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    return this.toResponse(submission);
  }

  async findSubmittedPackageByToken(locationSlug: string, token: string) {
    const normalizedLocation = locationSlug.trim().toLowerCase();
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      throw new BadRequestException('Enrolment package token is required.');
    }

    // Resolve the link to exactly one submission. New links carry the unique
    // per-submission packageToken. Old links carried `token`, which is fine when
    // it is unique (invitation submissions) but is the SHARED kiosk token for
    // kiosk submissions — matching that to a single submission would leak another
    // family's form, so a shared-token link resolves to nothing.
    //
    // Use NotFound (not Unauthorized) for a bad/expired link: the web apiClient
    // treats any 401 as a dead session and redirects to the login/home page, so
    // a logged-out family was being bounced to login instead of seeing a clean
    // "package unavailable" message.
    let submission = await this.submissionRepository.findOne({
      where: {
        locationSlug: normalizedLocation,
        packageToken: normalizedToken,
      },
    });

    if (!submission) {
      // Legacy link fallback: only honour it when the token maps to a single
      // submission (a unique invitation token), never a shared kiosk token.
      const matches = await this.submissionRepository.find({
        where: {
          locationSlug: normalizedLocation,
          token: normalizedToken,
        },
        take: 2,
      });
      submission = matches.length === 1 ? matches[0] : null;
    }

    if (!submission || submission.voidedAt) {
      throw new NotFoundException('Enrolment package not found for this link.');
    }

    return this.toPublicPdfResponse(submission);
  }

  async findAllForLocation(locationId: number, query: FindDigitalEnrollmentSubmissionsQuery) {
    const page = this.toPositiveInt(query.page, 1);
    const limit = Math.min(this.toPositiveInt(query.limit, 20), 100);
    const queryBuilder = this.submissionRepository
      .createQueryBuilder('submission')
      .where('submission.locationId = :locationId', { locationId });

    if (query.status === 'voided') {
      queryBuilder.andWhere('submission.voidedAt IS NOT NULL');
    } else {
      queryBuilder.andWhere('submission.voidedAt IS NULL');
      if (query.status && query.status !== 'all') {
        queryBuilder.andWhere('submission.status = :status', { status: query.status });
      }
    }

    if (query.linkedCustomerId) {
      const linkedCustomerId = Number(query.linkedCustomerId);
      if (Number.isInteger(linkedCustomerId) && linkedCustomerId > 0) {
        queryBuilder.andWhere('submission.linkedCustomerId = :linkedCustomerId', {
          linkedCustomerId,
        });
      }
    }

    this.applyJsonTextFilter(queryBuilder, 'submission.studentData', query.student, 'student');
    this.applyJsonTextFilter(queryBuilder, 'submission.guardianData', query.guardian, 'guardian');
    this.applyJsonTextFilter(queryBuilder, 'submission.guardianData', query.email, 'email');
    this.applyJsonTextFilter(queryBuilder, 'submission.programPreferenceData', query.instrument, 'instrument');

    if (query.submittedFrom) {
      queryBuilder.andWhere('submission.submittedAt >= :submittedFrom', {
        submittedFrom: `${query.submittedFrom} 00:00:00`,
      });
    }

    if (query.submittedTo) {
      queryBuilder.andWhere('submission.submittedAt <= :submittedTo', {
        submittedTo: `${query.submittedTo} 23:59:59`,
      });
    }

    const sortMap: Record<string, string> = {
      id: 'submission.id',
      status: 'submission.status',
      studentName: 'submission.studentData',
      primaryGuardian: 'submission.guardianData',
      instrument: 'submission.programPreferenceData',
      startDate: 'submission.schedulePreferenceData',
      submittedAt: 'submission.submittedAt',
    };
    const sortColumn = sortMap[query.sort || 'submittedAt'] || sortMap.submittedAt;
    const order = String(query.order || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    queryBuilder
      .orderBy(sortColumn, order)
      .skip((page - 1) * limit)
      .take(limit);

    const [submissions, total] = await queryBuilder.getManyAndCount();

    return {
      body: submissions.map((submission) => this.toListRow(submission)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Emailed enrolment links that have not yet been submitted — powers the
   * dashboard's "Sent Links" tab so staff can see which invitations went out and
   * when. Excludes kiosk and submitted links; voided links are hidden by default.
   */
  async findSentLinksForLocation(
    locationId: number,
    query: { page?: number | string; limit?: number | string; search?: string; voidFilter?: string },
  ) {
    const page = this.toPositiveInt(query.page, 1);
    const limit = Math.min(this.toPositiveInt(query.limit, 20), 100);
    const voidFilter = query.voidFilter ?? 'non-voided';
    if (!['non-voided', 'expired', 'failed', 'voided', 'all'].includes(voidFilter)) {
      throw new BadRequestException('Invalid sent link void filter.');
    }

    const queryBuilder = this.invitationRepository
      .createQueryBuilder('invitation')
      .where('invitation.locationId = :locationId', { locationId })
      // A row shows up once a send has been attempted at all — successful sends
      // (emailSentAt) and failed attempts (emailLastAttemptAt) both count.
      .andWhere(
        '(invitation.emailSentAt IS NOT NULL OR invitation.emailLastAttemptAt IS NOT NULL)',
      )
      .andWhere('invitation.isKiosk = :isKiosk', { isKiosk: false })
      .andWhere('invitation.submissionId IS NULL')
      .andWhere('invitation.status != :submitted', {
        submitted: DigitalEnrollmentInvitationStatus.SUBMITTED,
      });

    if (voidFilter !== 'all') {
      queryBuilder.andWhere(`invitation.status ${voidFilter === 'voided' ? '=' : '!='} :cancelled`, {
        cancelled: DigitalEnrollmentInvitationStatus.CANCELLED,
      });
    }

    if (voidFilter === 'expired') {
      queryBuilder.andWhere(new Brackets((expired) => {
        expired.where('invitation.status = :expired', { expired: DigitalEnrollmentInvitationStatus.EXPIRED })
          .orWhere('invitation.expiresAt < :now', { now: new Date() });
      }));
    }

    if (voidFilter === 'failed') {
      queryBuilder.andWhere('invitation.emailSentAt IS NULL')
        .andWhere("invitation.emailLastError IS NOT NULL AND invitation.emailLastError != ''");
    }

    const search = query.search?.trim();
    if (search) {
      queryBuilder.andWhere(
        '(invitation.customerName LIKE :search OR invitation.customerEmail LIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder
      .orderBy('COALESCE(invitation.emailSentAt, invitation.emailLastAttemptAt)', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [invitations, total] = await queryBuilder.getManyAndCount();

    const now = Date.now();
    return {
      body: invitations.map((invitation) => {
        const isFailed = !invitation.emailSentAt && Boolean(invitation.emailLastError);
        const isExpired =
          invitation.status === DigitalEnrollmentInvitationStatus.EXPIRED ||
          (invitation.expiresAt ? invitation.expiresAt.getTime() < now : false);
        return {
          id: invitation.id,
          customerName: invitation.customerName ?? '',
          customerEmail: invitation.customerEmail ?? '',
          emailSentAt: invitation.emailSentAt,
          emailLastAttemptAt: invitation.emailLastAttemptAt,
          emailLastError: invitation.emailLastError,
          expiresAt: invitation.expiresAt,
          status: invitation.status === DigitalEnrollmentInvitationStatus.CANCELLED
            ? 'voided' : isFailed ? 'failed' : isExpired ? 'expired' : 'sent',
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async updateStatus(
    locationId: number,
    id: number,
    status: DigitalEnrollmentSubmissionStatus,
    completionNote?: string | null,
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    submission.status = status;
    if (status === DigitalEnrollmentSubmissionStatus.REVIEWING) {
      submission.voidedAt = null;
      submission.voidReason = null;
      submission.voidedByUserId = null;
    }
    submission.reviewedAt = status === DigitalEnrollmentSubmissionStatus.SUBMITTED ? null : new Date();
    if (status === DigitalEnrollmentSubmissionStatus.CONVERTED && completionNote !== undefined) {
      submission.completionNote = completionNote?.trim() || null;
    }
    if (status === DigitalEnrollmentSubmissionStatus.CONVERTED && !submission.convertedAt) {
      submission.convertedAt = new Date();
    }

    const saved = await this.submissionRepository.save(submission);
    if (status === DigitalEnrollmentSubmissionStatus.CONVERTED && saved.linkedEnrolmentId) {
      await this.enrolmentRepository.update(
        { id: saved.linkedEnrolmentId },
        { isConfirmed: 1 },
      );
    }

    return this.toResponse(saved);
  }

  async updatePaymentMethod(
    locationId: number,
    id: number,
    paymentMethod: DigitalEnrollmentPaymentMethod | null,
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    submission.paymentMethod = paymentMethod ?? null;
    const saved = await this.submissionRepository.save(submission);
    return this.toResponse(saved);
  }

  /**
   * Merge the staff-entered payment figures into the submission. Only the keys
   * present in the request are changed; an empty string clears that figure. When
   * every figure is blank the whole object is stored as null so nothing renders.
   */
  async updatePaymentAmounts(
    locationId: number,
    id: number,
    amounts: UpdateDigitalEnrollmentPaymentAmountsDto,
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    const allowed = ['lessonPaymentFee', 'rentalFee', 'booksFee'];
    const incoming = amounts as Record<string, string | undefined>;
    const merged: Record<string, string> = { ...(submission.paymentAmounts ?? {}) };
    for (const key of allowed) {
      // Only touch keys that were actually supplied. A supplied empty string
      // clears that figure; a key left out (undefined) keeps its saved value.
      // (Note: DTO class fields exist as `undefined` on the instance, so we test
      // the value, not `key in incoming`.)
      const raw = incoming[key];
      if (raw === undefined) continue;
      const value = String(raw).trim();
      if (value) {
        merged[key] = value;
      } else {
        delete merged[key];
      }
    }

    submission.paymentAmounts = Object.keys(merged).length > 0 ? merged : null;
    const saved = await this.submissionRepository.save(submission);
    return this.toResponse(saved);
  }

  /**
   * Correct the submitted student / parent-guardian details before the enrolment
   * is converted (e.g. a mistyped email). Only whitelisted contact fields are
   * merged; editing is blocked once the enrolment is completed, since the linked
   * customer/student records are the source of truth from that point.
   */
  async updateSubmissionDetails(
    locationId: number,
    id: number,
    dto: { student?: Record<string, unknown>; guardians?: Record<string, unknown> },
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    if (submission.status === DigitalEnrollmentSubmissionStatus.CONVERTED) {
      throw new BadRequestException('This enrolment is completed and can no longer be edited.');
    }

    const studentFields = [
      'fullName',
      'birthDate',
      'gender',
      'address',
      'city',
      'postalCode',
      'homePhone',
      'cellPhone',
    ];
    const guardianFields = [
      'primaryName',
      'primaryEmail',
      'primaryPhone',
      'secondaryName',
      'secondaryEmail',
      'secondaryPhone',
    ];

    const merge = (
      current: Record<string, unknown>,
      updates: Record<string, unknown>,
      allowed: string[],
    ) => {
      const next = { ...current };
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
          const value = updates[key];
          next[key] = typeof value === 'string' ? value.trim() : value;
        }
      }
      return next;
    };

    if (dto.student) {
      submission.studentData = merge(
        submission.studentData as Record<string, unknown>,
        dto.student,
        studentFields,
      );
    }

    if (dto.guardians) {
      submission.guardianData = merge(
        submission.guardianData as Record<string, unknown>,
        dto.guardians,
        guardianFields,
      );
    }

    const saved = await this.submissionRepository.save(submission);
    return this.toResponse(saved);
  }

  async voidSubmission(locationId: number, id: number, reason: string, userId: number) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    submission.voidedAt = new Date();
    submission.voidReason = reason;
    submission.voidedByUserId = userId;
    const saved = await this.submissionRepository.save(submission);
    return this.toResponse(saved);
  }

  async restoreSubmission(locationId: number, id: number) {
    return this.updateStatus(locationId, id, DigitalEnrollmentSubmissionStatus.REVIEWING);
  }

  /**
   * Existing customers that match this submission. With no search term we seed
   * from the submission's own email / phone / name ("potential matches"); with
   * a search term we match that across name / email / phone. Two-step query
   * (match ids, then load contacts) avoids TypeORM pruning the contact
   * collections when filtering on a joined-and-selected relation.
   */
  async getCustomerCandidates(locationId: number, id: number, search?: string) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    const guardians = submission.guardianData as Record<string, unknown>;
    const student = submission.studentData as Record<string, unknown>;
    const trimmedSearch = search?.trim();
    const isPotentialMatch = !trimmedSearch;

    const terms = (
      trimmedSearch
        ? [trimmedSearch]
        : [
            this.stringValue(guardians.primaryEmail),
            this.stringValue(guardians.primaryPhone),
            this.stringValue(guardians.primaryName),
            this.stringValue(student.homePhone),
            this.stringValue(student.cellPhone),
          ]
    )
      .map((value) => (value ?? '').trim())
      .filter((value) => value.length >= 2);

    if (!terms.length) {
      return { body: [], isPotentialMatch };
    }

    const idQuery = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .leftJoin('user.profile', 'profile')
      .leftJoin('user.contacts', 'contact', 'contact.isDeleted = 0')
      .leftJoin('contact.emails', 'email', 'email.isDeleted = 0')
      .leftJoin('contact.phones', 'phone', 'phone.isDeleted = 0')
      .where('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = 0')
      .andWhere('userLocation.locationId = :locationId', { locationId });

    const params: Record<string, unknown> = {};
    const orClauses = terms.map((term, index) => {
      const key = `term${index}`;
      params[key] = `%${term}%`;
      return `(profile.firstname LIKE :${key} OR profile.lastname LIKE :${key} OR CONCAT(profile.firstname, ' ', profile.lastname) LIKE :${key} OR email.email LIKE :${key} OR phone.number LIKE :${key})`;
    });
    idQuery.andWhere(`(${orClauses.join(' OR ')})`, params);

    const idRows = await idQuery
      .select('DISTINCT user.id', 'id')
      .limit(20)
      .getRawMany<{ id: number }>();
    const ids = idRows.map((row) => Number(row.id)).filter(Boolean);

    if (!ids.length) {
      return { body: [], isPotentialMatch };
    }

    const users = await this.userRepository.find({
      where: { id: In(ids) },
      relations: ['profile', 'contacts', 'contacts.emails', 'contacts.phones'],
    });

    const body = users.map((user) => {
      const contact = this.pickCustomerContact(user);
      const fullName = `${user.profile?.firstname ?? ''} ${user.profile?.lastname ?? ''}`.trim();
      return { id: user.id, fullName, email: contact.email, phone: contact.phone };
    });

    return { body, isPotentialMatch };
  }

  private pickCustomerContact(user: User): { email: string; phone: string } {
    const contacts = (user.contacts ?? []).filter((contact) => !contact.isDeleted);
    const emails = contacts
      .flatMap((contact) => contact.emails ?? [])
      .filter((email) => !email.isDeleted);
    const phones = contacts
      .flatMap((contact) => contact.phones ?? [])
      .filter((phone) => !phone.isDeleted);
    return { email: emails[0]?.email ?? '', phone: phones[0]?.number ?? '' };
  }

  /**
   * Students belonging to the linked (or a chosen) customer, so the front desk
   * links a student that already belongs to that customer (per #9). The student
   * whose name matches the submission is flagged as a potential match.
   */
  async getStudentCandidates(
    locationSlug: string,
    locationId: number,
    id: number,
    customerId?: number,
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    const effectiveCustomerId = customerId ?? submission.linkedCustomerId ?? undefined;
    if (!effectiveCustomerId) {
      return { body: [], customerId: null };
    }

    const student = submission.studentData as Record<string, unknown>;
    const submissionStudentName = this.stringValue(student.fullName).trim().toLowerCase();

    const result = await this.studentService.getStudentsByCustomerId(
      locationSlug,
      effectiveCustomerId,
      { page: 1, limit: 200 } as CustomerStudentsRequestDto,
    );

    const body = (result.body ?? []).map((item) => ({
      id: item.id,
      fullName: item.fullName,
      birthDate: item.birthDate,
      isPotentialMatch:
        submissionStudentName.length > 0 &&
        String(item.fullName ?? '').trim().toLowerCase() === submissionStudentName,
    }));

    return { body, customerId: effectiveCustomerId };
  }

  private paymentMethodLabel(method: string | null | undefined): string {
    switch (method) {
      case DigitalEnrollmentPaymentMethod.CASH:
        return 'Cash';
      case DigitalEnrollmentPaymentMethod.CHEQUE:
        return 'Cheque';
      case DigitalEnrollmentPaymentMethod.DEBIT:
        return 'Debit';
      case DigitalEnrollmentPaymentMethod.VISA:
        return 'Visa';
      case DigitalEnrollmentPaymentMethod.MC:
        return 'MC';
      case DigitalEnrollmentPaymentMethod.PAD:
        return 'Pre-authorized debit';
      case DigitalEnrollmentPaymentMethod.E_TRANSFER:
      default:
        return 'E-transfer';
    }
  }

  async linkOrCreateCustomer(
    locationSlug: string,
    locationId: number,
    id: number,
    dto: LinkDigitalEnrollmentCustomerDto,
    loggedUserId: number,
  ) {
    const submission = await this.getSubmissionForConversion(locationId, id);

    if (submission.linkedCustomerId) {
      return this.toConversionResponse(submission, 'Customer is already linked.');
    }

    let customerId = dto.customerId;
    // Whether we created a brand-new customer (vs. linking an existing one).
    // Address / secondary contacts are only transferred when we create the
    // customer, so we never touch an existing customer's contact records.
    let createdNewCustomer = false;
    let primaryPhoneUsed = '';
    if (customerId) {
      await this.customerService.getCustomerById(customerId, locationSlug);
    } else {
      const guardians = submission.guardianData as Record<string, unknown>;
      const student = submission.studentData as Record<string, unknown>;
      const { firstName, lastName } = this.splitName(this.stringValue(guardians.primaryName), 'Customer');
      const email = this.stringValue(guardians.primaryEmail);
      const phoneNumber =
        this.stringValue(guardians.primaryPhone) ||
        this.stringValue(student.homePhone) ||
        this.stringValue(student.cellPhone) ||
        this.stringValue(guardians.secondaryPhone);

      if (!email) {
        throw new BadRequestException('Primary customer email is required to create a customer.');
      }

      const customer = await this.customerService.createCustomer(locationSlug, {
        firstname: firstName,
        lastname: lastName,
        email,
        phoneNumber: phoneNumber || undefined,
        description: 'Created from digital enrolment submission.',
      }, loggedUserId);
      customerId = customer.id;
      createdNewCustomer = true;
      primaryPhoneUsed = phoneNumber;
    }

    submission.linkedCustomerId = customerId;
    this.reactivateForConversion(submission);
    const saved = await this.submissionRepository.save(submission);

    // Once the customer is linked/saved, copy the address and secondary contact
    // details from the application onto the new customer profile. Best-effort:
    // the customer is already created and linked, so a hiccup adding one contact
    // must not fail the whole conversion or leave an orphaned customer.
    if (createdNewCustomer) {
      await this.transferApplicationContactsToCustomer(
        locationId,
        customerId,
        submission,
        primaryPhoneUsed,
        loggedUserId,
      );
    }

    return this.toConversionResponse(saved, dto.customerId ? 'Customer linked successfully.' : 'Customer created successfully.');
  }

  /**
   * Copy the address and secondary contact details captured on the digital
   * enrolment application onto a newly created customer profile.
   *
   * Customer creation itself only records the primary email and (optionally) a
   * primary phone, so without this the address block stays blank and the
   * secondary email/phone the customer entered are lost. Province and country
   * are not collected on the form, so we default them to the location the
   * customer is enrolling at (the address street/city/postal come from the
   * form). Each piece is best-effort and isolated: the customer is already
   * created and linked before this runs, so a failure on one contact is logged
   * and skipped rather than failing the conversion.
   */
  private async transferApplicationContactsToCustomer(
    locationId: number,
    customerId: number,
    submission: DigitalEnrollmentSubmission,
    primaryPhoneUsed: string,
    loggedUserId: number,
  ): Promise<void> {
    const guardians = (submission.guardianData ?? {}) as Record<string, unknown>;
    const student = (submission.studentData ?? {}) as Record<string, unknown>;

    // 1. Address — street/city/province/country/postal come from the form
    //    (the customer picks city/province/country from the dropdowns). Older
    //    submissions predate those fields, so province/country fall back to the
    //    location the customer enrolled at.
    const addressLine = this.stringValue(student.address);
    const city = this.stringValue(student.city);
    const postalCode = this.stringValue(student.postalCode);
    const cityId = this.positiveIntOrUndefined(student.cityId);
    let provinceId = this.positiveIntOrUndefined(student.provinceId);
    let countryId = this.positiveIntOrUndefined(student.countryId);
    if (addressLine) {
      try {
        if (provinceId === undefined || countryId === undefined) {
          const location = await this.locationRepository.getLocationDetails(locationId);
          provinceId = provinceId ?? location?.provinceId;
          countryId = countryId ?? location?.countryId;
        }
        await this.customersInfoAddressRepository.create(
          customerId,
          locationId,
          {
            address: addressLine,
            city: city || undefined,
            cityId,
            postalCode,
            provinceId,
            countryId,
            label: 'Home',
            isPrimary: true,
          },
          loggedUserId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to transfer address to customer ${customerId} from submission ${submission.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // 2. Secondary email — the primary email was already added when the customer
    //    was created; add the secondary as a non-primary email (skip duplicates).
    const secondaryEmail = this.stringValue(guardians.secondaryEmail);
    const primaryEmail = this.stringValue(guardians.primaryEmail);
    if (secondaryEmail && secondaryEmail.toLowerCase() !== primaryEmail.toLowerCase()) {
      try {
        await this.customersInfoEmailRepository.create(
          customerId,
          locationId,
          { email: secondaryEmail, isPrimary: false },
          loggedUserId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to transfer secondary email to customer ${customerId} from submission ${submission.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // 3. Secondary phone — add as a non-primary phone, unless it is the same
    //    number we already recorded as the primary phone.
    const secondaryPhone = this.stringValue(guardians.secondaryPhone);
    if (secondaryPhone && secondaryPhone !== primaryPhoneUsed) {
      try {
        await this.customersInfoPhoneRepository.create(
          customerId,
          locationId,
          { number: secondaryPhone, isPrimary: false },
          loggedUserId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to transfer secondary phone to customer ${customerId} from submission ${submission.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /** Initial processing moves a submitted form into Reviewing. Closed forms must be reopened explicitly. */
  private reactivateForConversion(submission: DigitalEnrollmentSubmission) {
    if (submission.status === DigitalEnrollmentSubmissionStatus.SUBMITTED) {
      submission.status = DigitalEnrollmentSubmissionStatus.REVIEWING;
      submission.reviewedAt = new Date();
    }
  }

  async linkOrCreateStudent(
    locationSlug: string,
    locationId: number,
    id: number,
    dto: LinkDigitalEnrollmentStudentDto,
    loggedUserId: number,
  ) {
    const submission = await this.getSubmissionForConversion(locationId, id);

    if (submission.linkedStudentId) {
      return this.toConversionResponse(submission, 'Student is already linked.');
    }

    if (!submission.linkedCustomerId) {
      throw new BadRequestException('Link or create a customer before linking or creating a student.');
    }

    const mediaAndOnlineLessonConsent = submission.policyAcknowledgementData.media_and_online_lesson_consent as boolean;    

    let studentId = dto.studentId;
    if (studentId) {
      await this.studentService.getStudentDetailsById(studentId, locationId, locationSlug);
      await this.studentService.validateStudentBelongsToCustomer(
        studentId,
        submission.linkedCustomerId,
        locationId,
        locationSlug,
      );
    } else {
      const student = submission.studentData as Record<string, unknown>;
      const { firstName, lastName } = this.splitName(this.stringValue(student.fullName), 'Student');
      const gender = this.normalizeGender(this.stringValue(student.gender));
      const birthDate = this.stringValue(student.birthDate);

      const result = await this.studentService.createStudent(
        locationSlug,
        locationId,
        {
          firstName,
          lastName,
          customerId: submission.linkedCustomerId!,
          birthDate: birthDate || undefined,
          gender,
          mediaAndOnlineLessonConsent,
        },
        loggedUserId,
      );
      studentId = result.id;
    }

    submission.linkedStudentId = studentId;
    this.reactivateForConversion(submission);
    const saved = await this.submissionRepository.save(submission);
    return this.toConversionResponse(saved, dto.studentId ? 'Student linked successfully.' : 'Student created successfully.');
  }

  /**
   * Link or create a student record for one of the extra students on a
   * multi-student form. Uses the same shared customer as the primary student,
   * and records the student id back onto that additional-student entry so the
   * front desk can then add its enrolment. Pass a studentId to link an existing
   * student (must belong to the shared customer); omit it to create a new one.
   */
  async createAdditionalStudent(
    locationSlug: string,
    locationId: number,
    id: number,
    index: number,
    loggedUserId: number,
    studentId?: number,
  ) {
    const submission = await this.getSubmissionForConversion(locationId, id);

    if (!submission.linkedCustomerId) {
      throw new BadRequestException('Link or create a customer before creating additional students.');
    }

    const mediaAndOnlineLessonConsent = submission.policyAcknowledgementData.media_and_online_lesson_consent as boolean;

    const students = Array.isArray(submission.additionalStudentsData)
      ? [...submission.additionalStudentsData]
      : [];
    const entry = students[index];
    if (!entry) {
      throw new NotFoundException('Additional student not found.');
    }
    if (entry.linkedStudentId) {
      return this.toConversionResponse(submission, 'This additional student has already been linked.');
    }

    let linkedStudentId = studentId;
    if (linkedStudentId) {
      await this.studentService.getStudentDetailsById(linkedStudentId, locationId, locationSlug);
      await this.studentService.validateStudentBelongsToCustomer(
        linkedStudentId,
        submission.linkedCustomerId,
        locationId,
        locationSlug,
      );
    } else {
      const { firstName, lastName } = this.splitName(this.stringValue(entry.fullName), 'Student');
      const gender = this.normalizeGender(this.stringValue(entry.gender));
      const birthDate = this.stringValue(entry.birthDate);

      const result = await this.studentService.createStudent(
        locationSlug,
        locationId,
        {
          firstName,
          lastName,
          customerId: submission.linkedCustomerId,
          birthDate: birthDate || undefined,
          gender,
          mediaAndOnlineLessonConsent,
        },
        loggedUserId,
      );
      linkedStudentId = result.id;
    }

    students[index] = { ...entry, linkedStudentId };
    submission.additionalStudentsData = students;
    this.reactivateForConversion(submission);
    const saved = await this.submissionRepository.save(submission);
    return this.toConversionResponse(
      saved,
      studentId ? 'Additional student linked successfully.' : 'Additional student created successfully.',
    );
  }

  /**
   * Unlink a student from an additional-student entry (e.g. wrong student
   * linked). Blocked while the student still has an active linked enrolment.
   */
  async unlinkAdditionalStudent(locationId: number, id: number, index: number) {
    const submission = await this.getSubmissionForConversion(locationId, id);

    const students = Array.isArray(submission.additionalStudentsData)
      ? [...submission.additionalStudentsData]
      : [];
    const entry = students[index];
    if (!entry) {
      throw new NotFoundException('Additional student not found.');
    }
    if (!entry.linkedStudentId) {
      return this.toConversionResponse(submission, 'This additional student is not linked.');
    }

    const linkedEnrolmentId = Number(entry.linkedEnrolmentId) || null;
    if (linkedEnrolmentId) {
      const enrolment = await this.enrolmentRepository.findOne({
        where: { id: linkedEnrolmentId },
        select: ['id', 'isDeleted'],
      });
      if (enrolment && !enrolment.isDeleted) {
        throw new BadRequestException('Remove the enrolment for this student before unlinking.');
      }
    }

    students[index] = { ...entry, linkedStudentId: null, linkedEnrolmentId: null, linkedCourseId: null };
    submission.additionalStudentsData = students;
    const saved = await this.submissionRepository.save(submission);
    return this.toConversionResponse(saved, 'Additional student unlinked successfully.');
  }

  /**
   * Record an enrolment (created via the standard enrolment flow) against one of
   * the extra students, so the queue/detail view reflects that the student is
   * fully enrolled.
   */
  async linkAdditionalStudentEnrolment(
    locationId: number,
    id: number,
    index: number,
    enrolmentId: number,
  ) {
    const submission = await this.getSubmissionForConversion(locationId, id);

    const students = Array.isArray(submission.additionalStudentsData)
      ? [...submission.additionalStudentsData]
      : [];
    const entry = students[index];
    if (!entry) {
      throw new NotFoundException('Additional student not found.');
    }
    if (!entry.linkedStudentId) {
      throw new BadRequestException('Create the additional student before linking an enrolment.');
    }

    const enrolment = await this.enrolmentRepository.findOne({
      where: { id: enrolmentId },
      select: ['id', 'courseId', 'studentId', 'isDeleted'],
    });

    if (!enrolment || enrolment.isDeleted) {
      throw new NotFoundException('Enrolment not found.');
    }
    if (Number(enrolment.studentId) !== Number(entry.linkedStudentId)) {
      throw new BadRequestException('Enrolment does not belong to this additional student.');
    }

    students[index] = {
      ...entry,
      linkedEnrolmentId: enrolment.id,
      linkedCourseId: enrolment.courseId ?? null,
      enrollmentPackageSnapshot: await this.captureEnrollmentPackageSnapshot(enrolment.id, locationId),
    };
    submission.additionalStudentsData = students;
    this.reactivateForConversion(submission);
    const saved = await this.submissionRepository.save(submission);
    return this.toConversionResponse(saved, 'Additional student enrolment linked successfully.');
  }

  async unlinkCustomer(locationId: number, id: number) {
    const submission = await this.getSubmissionForConversion(locationId, id);
    await this.ensureNoActiveLinkedEnrollment(submission, 'Unlink the enrolment before unlinking the customer.');

    if (!submission.linkedCustomerId) {
      return this.toConversionResponse(submission, 'Customer is not linked.');
    }

    submission.linkedCustomerId = null;
    submission.linkedStudentId = null;
    const saved = await this.submissionRepository.save(submission);
    return this.toConversionResponse(saved, 'Customer unlinked successfully.');
  }

  async unlinkStudent(locationId: number, id: number) {
    const submission = await this.getSubmissionForConversion(locationId, id);
    await this.ensureNoActiveLinkedEnrollment(submission, 'Unlink the enrolment before unlinking the student.');

    if (!submission.linkedStudentId) {
      return this.toConversionResponse(submission, 'Student is not linked.');
    }

    submission.linkedStudentId = null;
    const saved = await this.submissionRepository.save(submission);
    return this.toConversionResponse(saved, 'Student unlinked successfully.');
  }

  async createEnrollment(locationSlug: string, locationId: number, id: number, loggedUserId: number) {
    const submission = await this.getSubmissionForConversion(locationId, id);

    if (!submission.linkedStudentId) {
      throw new BadRequestException('Link or create a student before creating an enrolment.');
    }

    if (submission.linkedEnrolmentId) {
      const linkedEnrolment = await this.enrolmentRepository.findOne({
        where: { id: submission.linkedEnrolmentId },
        select: ['id', 'isDeleted'],
      });

      if (linkedEnrolment && !linkedEnrolment.isDeleted) {
        return this.toConversionResponse(submission, 'Enrolment is already created.');
      }

      submission.linkedEnrolmentId = null;
      submission.linkedCourseId = null;
      await this.submissionRepository.save(submission);
    }

    const enrolmentDto = await this.buildEnrollmentDto(locationId, submission);
    const enrolment = await this.studentEnrolmentService.createEnrolment(
      locationId,
      locationSlug,
      submission.linkedStudentId,
      enrolmentDto,
      loggedUserId,
    );

    submission.linkedEnrolmentId = enrolment.id;
    submission.linkedCourseId = enrolment.courseId ?? null;
    submission.enrollmentPackageSnapshot = await this.captureEnrollmentPackageSnapshot(enrolment.id, locationId);
    this.reactivateForConversion(submission);

    const saved = await this.submissionRepository.save(submission);
    return {
      ...await this.toConversionResponse(saved, 'Enrolment created successfully.'),
      enrolment,
    };
  }

  async linkEnrollment(locationId: number, id: number, dto: LinkDigitalEnrollmentEnrolmentDto) {
    const submission = await this.getSubmissionForConversion(locationId, id);

    if (!submission.linkedCustomerId || !submission.linkedStudentId) {
      throw new BadRequestException('Link or create a customer and student before linking an enrolment.');
    }

    const enrolment = await this.enrolmentRepository.findOne({
      where: {
        id: dto.enrolmentId,
      },
      select: ['id', 'courseId', 'studentId', 'isDeleted', 'isConfirmed'],
    });

    if (!enrolment || enrolment.isDeleted) {
      throw new NotFoundException('Enrolment not found.');
    }

    if (Number(enrolment.studentId) !== Number(submission.linkedStudentId)) {
      throw new BadRequestException('Enrolment does not belong to the linked student.');
    }

    // Initial processing promotes Submitted before the explicit completion below.
    this.reactivateForConversion(submission);
    submission.linkedEnrolmentId = enrolment.id;
    submission.linkedCourseId = enrolment.courseId ?? null;
    submission.enrollmentPackageSnapshot = await this.captureEnrollmentPackageSnapshot(enrolment.id, locationId);
    submission.status = DigitalEnrollmentSubmissionStatus.CONVERTED;
    submission.reviewedAt = submission.reviewedAt ?? new Date();
    submission.convertedAt = new Date();

    const saved = await this.submissionRepository.save(submission);
    return this.toConversionResponse(saved, 'Enrolment linked successfully.');
  }

  async sendSubmissionEmail(
    locationSlug: string,
    locationId: number,
    id: number,
    dto: SendDigitalEnrollmentEmailDto,
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    const location = await this.locationRepository.getLocationDetails(locationId);
    const locationEmail = typeof location?.email === 'string' ? location.email.trim() : '';

    if (!locationEmail) {
      throw new BadRequestException('Location email is required before sending enrolment email.');
    }

    const guardians = submission.guardianData as Record<string, unknown>;
    const primaryEmail = typeof guardians.primaryEmail === 'string' ? guardians.primaryEmail.trim() : '';
    const recipients = this.normalizeEmails(dto.to?.length ? dto.to : primaryEmail ? [primaryEmail] : [locationEmail]);
    const bcc = this.normalizeEmails(dto.bcc ?? (primaryEmail ? [locationEmail] : []));

    if (!recipients.length) {
      throw new BadRequestException('At least one recipient email is required.');
    }

    await this.mailerService.sendEmail({
      from: locationEmail,
      replyTo: locationEmail,
      to: recipients,
      bcc,
      subject: dto.subject?.trim() || (submission.linkedEnrolmentId ? 'Arcadia enrolment details and payment instructions' : 'Student enrolment received'),
      html: dto.content?.trim() || await this.buildDefaultEnrollmentEmailHtml(locationSlug, submission, location, {
        message: dto.message,
        includePdfLink: dto.includePdfLink,
      }),
    });

    return {
      id: submission.id,
      sent: true,
      to: recipients,
      bcc,
    };
  }

  private validatePolicyAcknowledgements(policies: Record<string, boolean>) {
    const missingPolicy = requiredPolicyKeys.find((key) => policies[key] !== true);
    if (missingPolicy) {
      throw new BadRequestException('All policy acknowledgements are required.');
    }
  }

  private validateContact(dto: CreateDigitalEnrollmentSubmissionDto) {
    if (!dto.guardians.primaryPhone?.trim()) {
      throw new BadRequestException('Primary parent or guardian phone is required.');
    }
  }

  private async validateInvitation(locationSlug: string, token: string) {
    const invitation = await this.invitationRepository.findOne({
      where: {
        locationSlug,
        tokenHash: this.hashToken(token.trim()),
      },
    });

    if (!invitation) {
      throw new UnauthorizedException('Invalid enrolment link.');
    }

    // Kiosk links are permanent and reusable, so they skip the pending/expiry gates.
    if (invitation.isKiosk) {
      return invitation;
    }

    if (invitation.status !== DigitalEnrollmentInvitationStatus.PENDING) {
      throw new UnauthorizedException('Enrolment link is no longer active.');
    }

    if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
      invitation.status = DigitalEnrollmentInvitationStatus.EXPIRED;
      await this.invitationRepository.save(invitation);
      throw new UnauthorizedException('Enrolment link has expired.');
    }

    return invitation;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private generatePackageToken() {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Return a submission's unique package token, generating and persisting one for
   * rows created before packageToken existed. Used when building the package link
   * so every emailed link resolves to exactly one submission.
   */
  private async ensurePackageToken(
    submission: DigitalEnrollmentSubmission,
  ): Promise<string> {
    if (submission.packageToken) {
      return submission.packageToken;
    }
    submission.packageToken = this.generatePackageToken();
    await this.submissionRepository.update(
      { id: submission.id },
      { packageToken: submission.packageToken },
    );
    return submission.packageToken;
  }

  private normalizeEmails(values: string[]) {
    return Array.from(
      new Set(
        values
          .map((value) => value?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  private async getSubmissionForConversion(locationId: number, id: number) {
    const submission = await this.submissionRepository.findOne({
      where: { id, locationId },
    });

    if (!submission) {
      throw new NotFoundException('Digital enrolment submission not found.');
    }

    if (
      submission.voidedAt ||
      submission.status === DigitalEnrollmentSubmissionStatus.CONVERTED ||
      submission.status === DigitalEnrollmentSubmissionStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Mark this digital enrolment Reviewing before creating, linking or unlinking records.',
      );
    }

    return submission;
  }

  private async ensureNoActiveLinkedEnrollment(submission: DigitalEnrollmentSubmission, message: string) {
    if (!submission.linkedEnrolmentId) return;

    const linkedEnrolment = await this.enrolmentRepository.findOne({
      where: { id: submission.linkedEnrolmentId },
      select: ['id', 'isDeleted'],
    });

    if (linkedEnrolment && !linkedEnrolment.isDeleted) {
      throw new BadRequestException(message);
    }

    submission.linkedEnrolmentId = null;
    submission.linkedCourseId = null;
  }

  private async toConversionResponse(submission: DigitalEnrollmentSubmission, message: string) {
    return {
      message,
      submission: await this.toResponse(submission),
      linkedCustomerId: submission.linkedCustomerId,
      linkedStudentId: submission.linkedStudentId,
      linkedEnrolmentId: submission.linkedEnrolmentId,
      linkedCourseId: submission.linkedCourseId,
    };
  }

  /**
   * Hourly rate for a new digital enrolment.
   *
   * Falls back to the fee captured on the form whenever the catalogue cannot
   * answer - an unclassified program, a duration outside 30/45/60, or a start
   * date before the new structure begins. Falling back is deliberate: a
   * submitted fee that a parent has seen is a better answer than refusing to
   * create the enrolment.
   */
  /**
   * Does this program carry a tier at this location?
   *
   * The same two conditions the rate resolution uses, asked separately because
   * the answer decides whether a tier is written at all - and writing one for
   * an unclassified program would put a meaningless row in the tier audit
   * history and on the review report.
   *
   * `isTierable`, not `isClassified`: a marker-prefixed program is classified
   * but holds a frozen older sheet, and stamping tier 1 on one would show it on
   * the review report as needing a tier confirmed when no tier can ever apply.
   */
  private async isTieredProgram(
    locationId: number,
    programId: number,
  ): Promise<boolean> {
    if (!(await this.pricingRollout.isEnabledForLocation(locationId))) {
      return false;
    }

    const program = await this.programRepository.findOne({
      where: { id: programId },
    });

    return !!program && this.programPresentation.isTierable(program);
  }

  private async resolveProgramRate(
    locationId: number,
    programId: number,
    duration: string,
    startDate: string,
    submittedRate: number,
  ): Promise<number> {
    // The rollout gate. Outside the pilot locations the form fee stands, which
    // is what every location did before the September structure existed.
    if (!(await this.pricingRollout.isEnabledForLocation(locationId))) {
      return submittedRate;
    }

    const program = await this.programRepository.findOne({
      where: { id: programId },
    });

    // `isTierable`, not `isClassified`. This is the money line: a marker
    // program holds the 2018 sheet at $57.50 an hour, so resolving a September
    // rate here would quote a parent $72.50 for a program that exists to
    // preserve the older price - and the form is customer-facing, so the wrong
    // figure is the one they agreed to.
    if (!program || !this.programPresentation.isTierable(program)) {
      return submittedRate;
    }

    const [hoursRaw = '0', minutesRaw = '0'] = duration.split(':');
    const durationMinutes =
      (Number(hoursRaw) || 0) * 60 + (Number(minutesRaw) || 0);

    try {
      const resolved = await this.pricingResolver.resolve({
        locationId,
        pricingCategory: this.programPresentation.pricingCategoryFor(program),
        // A digital enrolment has no tier yet - staff set it when they review
        // the submission. Tier 1 is the entry price and matches the migration
        // default, so a wrong tier under-charges rather than surprising a
        // parent with more than the form quoted.
        pricingTier: DEFAULT_PRICING_TIER,
        durationMinutes,
        termMonths: 1,
        effectiveDate: startDate,
        programType: program.type,
      });

      return Number(resolved.hourlyRate);
    } catch {
      // The resolver fails closed by design. Here that means "no catalogue
      // answer", which is a fallback rather than an error.
      return submittedRate;
    }
  }

  private async buildEnrollmentDto(
    locationId: number,
    submission: DigitalEnrollmentSubmission,
  ): Promise<CreateStudentEnrolmentDto> {
    const program = submission.programPreferenceData as Record<string, unknown>;
    const schedule = submission.schedulePreferenceData as Record<string, unknown>;
    const fee = submission.feeSnapshotData as Record<string, unknown>;

    const programId = Number(program.programId);
    if (!Number.isInteger(programId) || programId <= 0) {
      throw new BadRequestException('Program is required before creating an enrolment.');
    }

    const teacherId = await this.resolveTeacherId(
      locationId,
      programId,
      this.stringValue(program.instructor),
    );
    const startDate = this.stringValue(schedule.startDate);
    const startTime = this.normalizeTime(this.stringValue(schedule.time));
    const duration = this.normalizeDuration(this.stringValue(schedule.lessonDuration) || '00:30');
    // The parent's payment preference is honoured as submitted.
    //
    // It used to be forced to Monthly on a tierable program, because the 3/6/10
    // per cent reductions this resolves cannot reproduce the September sheet's
    // whole-dollar totals and always under-charged. Prepaid cycle pricing now
    // supplies the published total at confirmation and **supersedes** this
    // percentage wherever it applies, so the guard would only be discarding a
    // preference the parent expressed.
    //
    // The percentage is deliberately still written. It is the fallback for
    // everything prepaid does not cover - a program outside the September
    // structure, or a term the client never priced - which is exactly the
    // behaviour those enrolments had before any of this existed.
    const payment = this.resolvePaymentPlan(
      this.stringValue(fee.paymentPreference),
    );

    // The fee captured on the form is what the parent was shown when they
    // filled it in, which can be days or weeks before a member of staff
    // processes it. A form completed in August and processed in September
    // would otherwise carry August's price into a September enrolment.
    //
    // Resolve from the catalogue for the date the enrolment actually starts,
    // and fall back to the submitted figure when the catalogue has no answer -
    // which is the case for every program not yet classified, and for every
    // enrolment before the September structure takes effect.
    const programRate = await this.resolveProgramRate(
      locationId,
      programId,
      duration,
      startDate,
      this.parseMoney(fee.lessonFee),
    );
    const discountedRatePerMonth = this.calculateDiscountedMonthlyRate(
      programRate,
      duration,
      payment.discount,
    );

    if (!startDate) {
      throw new BadRequestException('Start date is required before creating an enrolment.');
    }

    // A tier is mandatory for a classified program at a pilot location, and a
    // parent is never asked about tiers (D6) - so quote at tier 1 and flag it
    // as defaulted. Staff confirm the real tier when they review, and the flag
    // is what makes the submission appear on the review report until they do.
    // Without this the conversion would be refused and the parent blocked.
    const pricingTier = (await this.isTieredProgram(locationId, programId))
      ? DEFAULT_PRICING_TIER
      : undefined;

    return {
      programId,
      programRate,
      pricingTier,
      pricingTierIsDefaulted: pricingTier !== undefined,
      duration,
      paymentFrequency: payment.frequency,
      paymentFrequencyDiscount: payment.discount || undefined,
      discountedRatePerMonth,
      lessonsCount: 96,
      autoRenew: true,
      startDate,
      paymentCycleEffectiveDate: startDate,
      isOnline: this.stringValue(schedule.deliveryMode) === 'online',
      teacherId,
      day: this.stringValue(schedule.day),
      startTime,
    };
  }

  private async resolveTeacherId(locationId: number, programId: number, teacherName: string) {
    if (!teacherName) {
      throw new BadRequestException('Instructor preference is required before creating an enrolment.');
    }

    const teachersResponse = await this.teacherService.findTeachersByLocationAndProgram(locationId, programId);
    const normalizedTeacherName = teacherName.trim().toLowerCase();
    const teacher = teachersResponse.body.find((candidate) => candidate.name.trim().toLowerCase() === normalizedTeacherName);

    if (!teacher) {
      throw new BadRequestException(`Instructor "${teacherName}" could not be matched for the selected program.`);
    }

    return teacher.id;
  }

  /**
   * The parent's payment preference, as a frequency and a fallback percentage.
   *
   * ## The frequency names are `payment_frequency.name` and must stay that way
   *
   * `createEnrolment` resolves the frequency **by name** and rejects anything it
   * cannot find. Six months was written here as `Every 6 Months`, which is not a
   * row - the six-month frequency is called **`Semi-Annually`** - so a six-month
   * submission failed with *"Invalid payment frequency"*.
   *
   * It went unnoticed because the prepaid guard that used to sit here forced a
   * tierable program to Monthly before this value was ever used, and the two
   * paths that reached it - a marker program and a location outside the rollout
   * - are rare. Removing the guard made it reachable on the common path.
   *
   * ## Why the percentages are still here
   *
   * They are the **pre-September** reductions and they cannot reproduce the
   * September sheet: all 54 totals disagree and always under-charge, by up to
   * $106.00. Prepaid cycle pricing now supplies the published total and
   * supersedes this percentage wherever it applies.
   *
   * They remain as the fallback for everything prepaid does not cover - a
   * program outside the September structure, a marker program holding an older
   * sheet, a location outside the rollout - which is exactly the behaviour those
   * enrolments have always had.
   */
  private resolvePaymentPlan(paymentPreference: string) {
    const plans: Record<string, { frequency: string; discount: number }> = {
      monthly: { frequency: 'Monthly', discount: 0 },
      'three-month': { frequency: 'Quarterly', discount: 3 },
      'six-month': { frequency: 'Semi-Annually', discount: 6 },
      'twelve-month': { frequency: 'Annually', discount: 10 },
    };

    return plans[paymentPreference] ?? plans.monthly;
  }

  private calculateDiscountedMonthlyRate(programRate: number, duration: string, discount: number) {
    const [hoursRaw = '0', minutesRaw = '0'] = duration.split(':');
    const hours = Number(hoursRaw) || 0;
    const minutes = Number(minutesRaw) || 0;
    const unit = (hours * 60 + minutes) / 60;
    const monthlyRate = programRate * unit * 4;
    const discounted = discount > 0 ? monthlyRate * (1 - discount / 100) : monthlyRate;
    return RoundingUtils.roundDecimal(discounted, 2);
  }

  private normalizeGender(value: string): 'male' | 'female' | 'not-specified' {
    return value === 'male' || value === 'female' ? value : 'not-specified';
  }

  private normalizeDuration(value: string) {
    if (/^\d{2}:\d{2}$/.test(value)) return value;
    if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5);
    return '00:30';
  }

  private normalizeTime(value: string) {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;

    const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!match) {
      throw new BadRequestException('Preferred time must be in HH:mm or h:mm AM/PM format.');
    }

    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? '0');
    const meridiem = match[3].toUpperCase();
    if (hours === 12) hours = 0;
    if (meridiem === 'PM') hours += 12;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private parseMoney(value: unknown) {
    const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  /** Coerce a stored id-like value to a positive integer, or undefined. */
  private positiveIntOrUndefined(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private splitName(fullName: string, fallback: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return { firstName: fallback, lastName: 'Enrollment' };
    }

    if (parts.length === 1) {
      return { firstName: parts[0], lastName: 'Enrollment' };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  private toPositiveInt(value: string | number | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private applyJsonTextFilter(
    queryBuilder: ReturnType<Repository<DigitalEnrollmentSubmission>['createQueryBuilder']>,
    column: string,
    value: string | undefined,
    paramName: string,
  ) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return;

    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where(`LOWER(${column}) LIKE :${paramName}`, {
          [paramName]: `%${normalized}%`,
        });
      }),
    );
  }

  private toListRow(submission: DigitalEnrollmentSubmission) {
    const student = submission.studentData as Record<string, unknown>;
    const guardians = submission.guardianData as Record<string, unknown>;
    const program = submission.programPreferenceData as Record<string, unknown>;
    const schedule = submission.schedulePreferenceData as Record<string, unknown>;
    const fee = submission.feeSnapshotData as Record<string, unknown>;

    return {
      id: submission.id,
      status: submission.status,
      studentName: student.fullName ?? '',
      primaryGuardian: guardians.primaryName ?? '',
      primaryEmail: guardians.primaryEmail ?? '',
      primaryPhone: guardians.primaryPhone ?? '',
      instrument: program.instrument ?? '',
      instructor: program.instructor ?? '',
      programType: program.programType ?? '',
      preferredDay: schedule.day ?? '',
      preferredTime: schedule.time ?? '',
      startDate: schedule.startDate ?? '',
      paymentPreference: fee.paymentPreference ?? '',
      source: submission.submissionSource ?? DigitalEnrollmentSubmissionSource.INVITATION,
      additionalStudentCount: Array.isArray(submission.additionalStudentsData)
        ? submission.additionalStudentsData.length
        : 0,
      submittedAt: submission.submittedAt,
      reviewedAt: submission.reviewedAt,
      isVoided: Boolean(submission.voidedAt),
      voidedAt: submission.voidedAt,
    };
  }

  private async getEnrollmentPackageDetails(submission: DigitalEnrollmentSubmission): Promise<DigitalEnrollmentPackageDetails | null> {
    // Prefer the point-in-time snapshot captured at conversion, so later edits to
    // the enrolment/discounts don't rewrite what the customer originally enrolled
    // with. Fall back to a live rebuild for rows created before snapshotting.
    if (submission.enrollmentPackageSnapshot) {
      return submission.enrollmentPackageSnapshot as unknown as DigitalEnrollmentPackageDetails;
    }
    if (!submission.linkedEnrolmentId) return null;
    return this.buildEnrollmentPackageForEnrolment(submission.linkedEnrolmentId, submission.locationId);
  }

  /**
   * Build the current enrolment package and return it in the shape stored on the
   * submission (JSON snapshot). Returns null when the enrolment can't be built.
   */
  private async captureEnrollmentPackageSnapshot(
    enrolmentId: number,
    locationId: number,
  ): Promise<Record<string, unknown> | null> {
    const pkg = await this.buildEnrollmentPackageForEnrolment(enrolmentId, locationId);
    return pkg ? (pkg as unknown as Record<string, unknown>) : null;
  }

  /**
   * Build the package/fee snapshot for a single enrolment. Reused for the
   * primary student and for each additional student's own enrolment so the
   * printed form can show a combined family total.
   */
  private async buildEnrollmentPackageForEnrolment(
    enrolmentId: number,
    locationId: number,
  ): Promise<DigitalEnrollmentPackageDetails | null> {
    const enrolment = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.teacher', 'courseTeacher')
      .leftJoinAndSelect('courseTeacher.profile', 'courseTeacherProfile')
      .leftJoinAndSelect('course.courseSchedule', 'courseSchedule')
      .leftJoinAndSelect('courseSchedule.teacher', 'scheduleTeacher')
      .leftJoinAndSelect('scheduleTeacher.profile', 'scheduleTeacherProfile')
      .leftJoinAndSelect('course.courseProgramRates', 'courseProgramRates')
      .leftJoinAndSelect('enrolment.paymentFrequency', 'paymentFrequency')
      .leftJoinAndSelect('enrolment.discounts', 'discounts')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .orderBy('courseSchedule.isRecent', 'DESC')
      .addOrderBy('courseSchedule.id', 'DESC')
      .addOrderBy('courseProgramRates.id', 'DESC')
      .addOrderBy('discounts.id', 'DESC')
      .getOne();

    if (!enrolment?.course) return null;

    const location = await this.locationRepository.getLocationDetails(locationId);
    const course = enrolment.course as any;
    const schedules = Array.isArray(course.courseSchedule) ? course.courseSchedule : [];
    const recentSchedule = schedules.find((schedule: any) => Boolean(schedule.isRecent)) ?? schedules[0] ?? null;
    const rates = Array.isArray(course.courseProgramRates) ? course.courseProgramRates : [];
    const recentRate = rates[0] ?? null;
    const teacher = recentSchedule?.teacher ?? course.teacher;

    return {
      enrolmentId: enrolment.id,
      courseId: enrolment.courseId ?? course.id ?? null,
      programName: this.stringValue(course.program?.name),
      teacherName: this.formatUserName(teacher),
      day: this.formatWeekday(recentSchedule?.day),
      time: this.normalizePackageTime(recentSchedule?.fromTime),
      duration: this.normalizeDuration(this.stringValue(recentSchedule?.duration) || '00:30'),
      startDate: this.formatDateValue(course.startDate ?? recentSchedule?.startDate),
      endDate: this.formatDateValue(enrolment.endDateTime ?? course.endDate ?? recentSchedule?.endDate),
      paymentFrequency: this.stringValue((enrolment as any).paymentFrequency?.name),
      paymentFrequencyLength: Number((enrolment as any).paymentFrequency?.frequencyLength ?? 1) || 1,
      lessonRate: Number(recentRate?.programRate ?? course.program?.rate ?? 0) || 0,
      lessonsCount: Number(course.lessonsCount ?? 0) || 0,
      isOnline: Number(course.isOnline ?? enrolment.isOnline ?? 0) === 1,
      discounts: (enrolment.discounts ?? []).map(discount => ({
        id: discount.id,
        discount: Number(discount.discount ?? 0),
        discountType: discount.discountType,
        type: discount.type,
      })),
      paymentEmail: this.stringValue(location?.email),
      locationPhone: this.stringValue(location?.phoneNumber),
      locationAddress: this.stringValue(location?.address),
    };
  }

  /**
   * The additional students for the response, each enriched with its own
   * enrolment package (when created) so the family's combined total can be
   * shown. Order matches additionalStudentsData.
   */
  private async buildAdditionalStudentsResponse(submission: DigitalEnrollmentSubmission) {
    const students = Array.isArray(submission.additionalStudentsData)
      ? submission.additionalStudentsData
      : [];
    return Promise.all(
      students.map(async (entry) => {
        // Prefer the snapshot captured when this student's enrolment was linked;
        // fall back to a live rebuild for entries linked before snapshotting.
        const enrolmentId = Number(entry.linkedEnrolmentId) || null;
        const enrollmentPackage = entry.enrollmentPackageSnapshot
          ? (entry.enrollmentPackageSnapshot as unknown as DigitalEnrollmentPackageDetails)
          : enrolmentId
            ? await this.buildEnrollmentPackageForEnrolment(enrolmentId, submission.locationId)
            : null;
        return { ...entry, enrollmentPackage };
      }),
    );
  }

  private formatUserName(user: any) {
    const profile = user?.profile;
    return [profile?.firstname, profile?.lastname].map((part) => this.stringValue(part)).filter(Boolean).join(' ');
  }

  private formatWeekday(value: unknown) {
    const dayNumber = Number(value);
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 7 ? dayNames[dayNumber] : '';
  }

  private normalizePackageTime(value: unknown) {
    const time = this.stringValue(value);
    const match = time.match(/^(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : time;
  }

  private formatDateValue(value: unknown) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return this.stringValue(value);
    return date.toISOString().slice(0, 10);
  }

  private formatDurationLabel(value: string) {
    const [hoursRaw = '0', minutesRaw = '0'] = value.split(':');
    const hours = Number(hoursRaw) || 0;
    const minutes = Number(minutesRaw) || 0;
    const parts: string[] = [];
    if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes) parts.push(`${minutes} minutes`);
    return parts.join(' ') || value;
  }

  private titleize(value: string) {
    return value
      .replace(/[-_]+/g, ' ')
      .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  /**
   * Present a staff-entered money string. A plain number gets a "$" prefix; a
   * value that already carries a symbol/text is left as typed.
   */
  private formatMoneyText(value: unknown): string {
    const v = this.stringValue(value).trim();
    if (!v) return '';
    return /^[0-9]/.test(v) ? `$${v}` : v;
  }

  /**
   * Total Fee Payable = the sum of the staff-entered Lesson Payment Fee, Rental
   * Fee and Books. Returns a 2dp string, or '' when none of the three are set.
   */
  private computeTotalFeePayable(
    amounts: Record<string, string> | null | undefined,
  ): string {
    if (!amounts) return '';
    let hasAny = false;
    let sum = 0;
    for (const key of ['lessonPaymentFee', 'rentalFee', 'booksFee']) {
      const cleaned = this.stringValue(amounts[key]).replace(/[^0-9.\-]/g, '');
      if (!cleaned) continue;
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) {
        sum += parsed;
        hasAny = true;
      }
    }
    return hasAny ? sum.toFixed(2) : '';
  }

  private async buildDefaultEnrollmentEmailHtml(
    locationSlug: string,
    submission: DigitalEnrollmentSubmission,
    location: Record<string, unknown>,
    options?: { message?: string; includePdfLink?: boolean },
  ) {
    const student = submission.studentData as Record<string, unknown>;
    const guardians = submission.guardianData as Record<string, unknown>;
    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    // Use the unique per-submission package token, not `token` (which is the
    // shared kiosk token for kiosk submissions and would resolve to the wrong
    // family's form).
    const packageToken = await this.ensurePackageToken(submission);
    const pdfPath = `/v2/digital-enrollments/${locationSlug}/package/${encodeURIComponent(packageToken)}/pdf`;
    const pdfUrl = baseUrl ? `${baseUrl}${pdfPath}` : pdfPath;
    const packageDetails = await this.getEnrollmentPackageDetails(submission);
    const locationEmail = this.stringValue(location?.email);
    const locationPhone = this.stringValue(location?.phoneNumber);
    const locationAddress = this.stringValue(location?.address);
    const includePdfLink = options?.includePdfLink !== false;
    const customMessageHtml = options?.message?.trim()
      ? `<p style="font-size:14px;margin:0 0 16px 0;color:#111;white-space:pre-line;">${this.escapeHtml(options.message.trim())}</p>`
      : '';

    if (packageDetails) {
      const scheduleSummary = this.formatEmailSchedule(packageDetails.day, packageDetails.time);
      const locationName = this.titleize(locationSlug);
      const paymentReference = `Enrolment #${submission.linkedEnrolmentId ?? submission.id} - ${this.stringValue(student.fullName)}`;

      // Payment method is "Not selected" until staff choose one. Until then no
      // payment section is shown at all — and even once a method is chosen we no
      // longer fabricate an amount; staff state the amount in their own message.
      const selectedMethod =
        (submission.paymentMethod as DigitalEnrollmentPaymentMethod) || null;
      const hasPaymentMethod = selectedMethod !== null;
      const methodLabel = selectedMethod ? this.paymentMethodLabel(selectedMethod) : '';
      const isETransfer = selectedMethod === DigitalEnrollmentPaymentMethod.E_TRANSFER;
      const isPad = selectedMethod === DigitalEnrollmentPaymentMethod.PAD;
      const paymentIntro = !hasPaymentMethod
        ? 'Our team will follow up with payment instructions.'
        : isETransfer
          ? 'To hold the enrolment, please send payment by e-transfer using the instructions below.'
          : isPad
            ? 'Your enrolment is held once the front desk sets up your pre-authorized debit and confirms the schedule.'
            : `To hold the enrolment, please arrange payment (${methodLabel.toLowerCase()}) in person at the front desk.`;
      const paymentHeading = isETransfer
        ? 'E-transfer payment'
        : isPad
          ? 'Pre-authorized debit'
          : 'Payment';
      const paymentFirstRow = isETransfer
        ? this.emailRow('Send e-transfer to', locationEmail)
        : this.emailRow('Payment method', methodLabel);
      const paymentNote = isETransfer
        ? 'Please include the student name and enrolment number in the e-transfer message. The enrolment is held once payment is received and confirmed by the front desk.'
        : isPad
          ? 'The front desk will set up your pre-authorized debit. The enrolment is held once the schedule is confirmed by the front desk.'
          : `Please pay ${methodLabel.toLowerCase()} in person at the front desk. The enrolment is held once payment is received and confirmed by the front desk.`;

      // Amount = the staff-entered fees summed (Lesson Payment Fee + Rental +
      // Books). Never auto-derived from a placeholder; shown only when set.
      const totalFeePayable = this.computeTotalFeePayable(submission.paymentAmounts);
      const amountRow = totalFeePayable
        ? this.emailRow('Amount', this.formatMoneyText(totalFeePayable))
        : '';

      return `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5;">
          <h2 style="font-size:18px;font-weight:700;margin:0 0 8px 0;color:#111;">Enrolment details and payment instructions</h2>
          <p style="font-size:14px;margin:0 0 16px 0;color:#111;">Hi ${this.escapeHtml(guardians.primaryName || 'there')},</p>
          ${customMessageHtml}
          <p style="font-size:14px;margin:0 0 16px 0;color:#111;">
            Thank you for completing the student enrolment information. Your enrolment details are below. ${paymentIntro}
          </p>

          <h3 style="font-size:15px;font-weight:700;margin:18px 0 8px 0;color:#111;">Student and program</h3>
          <table style="width:100%;max-width:680px;border-collapse:collapse;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:8px 0 16px 0;">
            ${this.emailRow('Student', student.fullName)}
            ${this.emailRow('Program', packageDetails.programName)}
            ${this.emailRow('Instructor', packageDetails.teacherName)}
            ${this.emailRow('Schedule', scheduleSummary)}
            ${this.emailRow('Start date', this.formatEmailDate(packageDetails.startDate))}
            ${this.emailRow('Lesson duration', this.formatDurationLabel(packageDetails.duration))}
            ${this.emailRow('Delivery', packageDetails.isOnline ? 'Online' : 'In person')}
            ${this.emailRow('Payment frequency', packageDetails.paymentFrequency)}
          </table>

          ${hasPaymentMethod ? `<h3 style="font-size:15px;font-weight:700;margin:18px 0 8px 0;color:#111;">${this.escapeHtml(paymentHeading)}</h3>
          <table style="width:100%;max-width:680px;border-collapse:collapse;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:8px 0 16px 0;">
            ${paymentFirstRow}
            ${amountRow}
            ${this.emailRow('Reference / memo', paymentReference)}
            ${this.emailRow('Location', locationName)}
            ${this.emailRow('Location phone', locationPhone)}
            ${this.emailRow('Location address', locationAddress)}
          </table>
          <p style="font-size:13px;margin:0 0 12px 0;color:#111;">
            ${this.escapeHtml(paymentNote)}
          </p>` : ''}

          <h3 style="font-size:15px;font-weight:700;margin:18px 0 8px 0;color:#111;">Calendar details</h3>
          <ul style="font-size:13px;margin:0 0 16px 20px;padding:0;color:#111;">
            <li>Arcadia's calendar is based on 48 teaching weeks, equal to four lessons per month.</li>
            <li>The fifth lesson week is treated as a Professional Development Day and occurs four times yearly.</li>
            <li>Holiday make-up lessons and weather-related changes follow the policies acknowledged in the enrolment form.</li>
            <li>The school will contact families for closures, schedule changes, and other program updates.</li>
          </ul>

          ${includePdfLink ? `<p style="font-size:14px;margin:16px 0 0 0;color:#111;">
            View or print the completed enrolment package:
            <a href="${this.escapeHtml(pdfUrl)}" style="color:#2563eb;text-decoration:underline;">${this.escapeHtml(pdfUrl)}</a>
          </p>` : ''}
        </div>
      `;
    }

    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5;">
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px 0;color:#111;">Student enrolment received</h2>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">A digital enrolment intake has been received and is ready for front desk review.</p>
        ${customMessageHtml}
        <table style="width:100%;max-width:640px;border-collapse:collapse;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:16px 0;">
          ${this.emailRow('Submission ID', submission.id)}
          ${this.emailRow('Student', student.fullName)}
          ${this.emailRow('Primary parent or guardian', guardians.primaryName)}
          ${this.emailRow('Primary email', guardians.primaryEmail)}
          ${this.emailRow('Submitted at', this.formatEmailDateTime(submission.submittedAt))}
        </table>
        ${includePdfLink ? `<p style="font-size:14px;margin:16px 0 0 0;color:#111;">
          View or print the completed enrolment form:
          <a href="${this.escapeHtml(pdfUrl)}" style="color:#2563eb;text-decoration:underline;">${this.escapeHtml(pdfUrl)}</a>
        </p>` : ''}
      </div>
    `;
  }

  /**
   * Best-effort front-desk alert when a new form is submitted. Sent to the
   * location's own email address so staff know to process it. Distinguishes
   * kiosk (in-studio) from emailed-invitation submissions.
   */
  private async sendNewSubmissionAlert(
    locationSlug: string,
    locationId: number,
    submission: DigitalEnrollmentSubmission,
  ) {
    const location = await this.locationRepository.getLocationDetails(locationId);
    const locationEmail = typeof location?.email === 'string' ? location.email.trim() : '';
    if (!locationEmail) {
      this.logger.warn(`No location email for ${locationSlug}; skipping new-submission alert.`);
      return;
    }

    const student = submission.studentData as Record<string, unknown>;
    const guardians = submission.guardianData as Record<string, unknown>;
    const studentName = this.stringValue(student?.fullName) || 'New student';
    const guardianName = this.stringValue(guardians?.primaryName);
    const guardianEmail = this.stringValue(guardians?.primaryEmail);
    const guardianPhone = this.stringValue(guardians?.primaryPhone);
    const sourceLabel =
      submission.submissionSource === DigitalEnrollmentSubmissionSource.KIOSK
        ? 'In-studio kiosk'
        : 'Emailed invitation';

    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    // Admin app is served under /v2 (same as the other emails' links). BASE_URL
    // may or may not already include /v2, so only add it when it's missing.
    const v2Prefix = baseUrl.includes('/v2') ? '' : '/v2';
    const adminPath = `${v2Prefix}/admin/${locationSlug}/digital-enrollments/${submission.id}`;
    const adminUrl = baseUrl ? `${baseUrl}${adminPath}` : adminPath;

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5;">
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px 0;color:#111;">New enrolment form submitted</h2>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">A new digital enrolment form has just been submitted and is waiting to be reviewed.</p>
        <table style="width:100%;max-width:640px;border-collapse:collapse;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:16px 0;">
          ${this.emailRow('Student', studentName)}
          ${this.emailRow('Parent or guardian', guardianName)}
          ${this.emailRow('Email', guardianEmail)}
          ${this.emailRow('Phone', guardianPhone)}
          ${this.emailRow('Source', sourceLabel)}
          ${this.emailRow('Submitted', this.formatEmailDateTime(submission.submittedAt))}
        </table>
        <p style="font-size:14px;margin:16px 0 0 0;color:#111;">
          Open in the enrolment queue:
          <a href="${this.escapeHtml(adminUrl)}" style="color:#2563eb;text-decoration:underline;">${this.escapeHtml(adminUrl)}</a>
        </p>
      </div>
    `;

    await this.mailerService.sendEmail({
      from: locationEmail,
      replyTo: locationEmail,
      to: [locationEmail],
      subject: `New enrolment form submitted — ${studentName}`,
      html,
    });
  }

  private buildInvitationEmailHtml(
    invitation: DigitalEnrollmentInvitation,
    enrollmentUrl: string,
    message?: string,
  ) {
    const customerName = invitation.customerName?.trim();
    const greetingName = customerName || 'there';
    const trimmedMessage = message?.trim();
    // Editable intro paragraph(s). The standard closing (reminders + sign-off)
    // below is fixed so every location sends consistent wording.
    const introText = trimmedMessage || DigitalEnrollmentSubmissionService.DEFAULT_INVITATION_INTRO;
    const safeUrl = this.escapeHtml(enrollmentUrl);

    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5;">
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">Hi ${this.escapeHtml(greetingName)},</p>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;white-space:pre-line;">${this.escapeHtml(introText)}</p>
        <p style="margin:0 0 16px 0;">
          <a href="${safeUrl}" style="display:inline-block;background:#ed1c24;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:6px;">Complete your registration</a>
        </p>
        <p style="font-size:12px;margin:0 0 16px 0;color:#555;">Or paste this link into your browser:<br>
          <a href="${safeUrl}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${safeUrl}</a>
        </p>
        <p style="font-size:12px;margin:0 0 16px 0;color:#555;">This link expires on ${this.escapeHtml(this.formatEmailDateTime(invitation.expiresAt))}.</p>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">Once you've submitted the form, our team will review your information, create your student account, and contact you to confirm your lesson schedule and arrange payment.</p>
        <p style="font-size:14px;font-weight:700;margin:0 0 4px 0;color:#111;">A few important reminders:</p>
        <ul style="font-size:14px;margin:0 0 16px 0;padding-left:20px;color:#111;">
          <li style="margin:0 0 6px 0;">Your lesson time will be reserved once your registration form has been submitted and your payment arrangements have been confirmed.</li>
          <li>If you have any questions while completing the registration form, please don't hesitate to contact us—we're happy to help.</li>
        </ul>
        <p style="font-size:14px;margin:0 0 16px 0;color:#111;">We look forward to welcoming you to Arcadia Academy of Music and being part of your musical journey!</p>
        <p style="font-size:14px;margin:0 0 4px 0;color:#111;">Warm regards,</p>
        <p style="font-size:14px;font-weight:700;margin:0;color:#111;">Arcadia Academy of Music</p>
      </div>
    `;
  }

  private emailRow(label: string, value: unknown) {
    return `
      <tr>
        <th style="text-align:left;border:1px solid #ddd;padding:6px;background-color:#f3f4f6;font-weight:600;width:180px;vertical-align:top;">${this.escapeHtml(label)}</th>
        <td style="border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top;">${this.escapeHtml(value ?? '')}</td>
      </tr>
    `;
  }

  private formatEmailDate(value: string | null | undefined) {
    if (!value) return '';

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
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  private formatEmailDateTime(value: Date | string | null | undefined) {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    }).format(date);
  }

  private formatEmailSchedule(day: string, time: string) {
    return [day, this.formatEmailTime(time)].filter(Boolean).join(' ');
  }

  private formatEmailTime(value: string) {
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return value;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;

    const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }).format(date);
  }

  private formatPaymentPreference(value: string) {
    return paymentPreferenceEmailLabels[value] ?? value;
  }

  private escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async toResponse(submission: DigitalEnrollmentSubmission) {
    const linkedEnrolment = submission.linkedEnrolmentId
      ? await this.enrolmentRepository.findOne({
          where: { id: submission.linkedEnrolmentId },
          select: ['id', 'isConfirmed', 'isDeleted'],
        })
      : null;
    const enrollmentPackage = await this.getEnrollmentPackageDetails(submission);
    const location = await this.locationRepository.getLocationDetails(submission.locationId);
    const policySections = await this.enrolmentPolicyService.resolveSignedPolicySections(
      submission.policySnapshot,
    );

    return {
      id: submission.id,
      locationId: submission.locationId,
      locationSlug: submission.locationSlug,
      // Always-available location contact (independent of the enrolment package)
      // so the printed form can show the school's own phone.
      locationPhone: this.stringValue(location?.phoneNumber),
      locationAddress: this.stringValue(location?.address),
      token: submission.token,
      status: submission.status,
      student: submission.studentData,
      guardians: submission.guardianData,
      programPreference: submission.programPreferenceData,
      schedulePreference: submission.schedulePreferenceData,
      feeSnapshot: submission.feeSnapshotData,
      parentPreference: submission.parentPreferenceData ?? {},
      additionalStudents: await this.buildAdditionalStudentsResponse(submission),
      policies: submission.policyAcknowledgementData,
      policySections,
      signature: {
        printedName: submission.signaturePrintedName,
        signedDate: submission.signatureSignedDate,
        dataUrl: submission.signatureDataUrl,
      },
      submittedIpAddress: submission.submittedIpAddress,
      submittedUserAgent: submission.submittedUserAgent,
      submittedAt: submission.submittedAt,
      reviewedAt: submission.reviewedAt,
      linkedCustomerId: submission.linkedCustomerId,
      linkedStudentId: submission.linkedStudentId,
      linkedEnrolmentId: submission.linkedEnrolmentId,
      linkedCourseId: submission.linkedCourseId,
      linkedEnrolmentIsDeleted: linkedEnrolment
        ? Boolean(linkedEnrolment.isDeleted)
        : submission.linkedEnrolmentId
          ? true
          : null,
      linkedEnrolmentIsConfirmed: linkedEnrolment
        ? !linkedEnrolment.isDeleted && Number(linkedEnrolment.isConfirmed) === 1
        : null,
      enrollmentPackage,
      paymentMethod: submission.paymentMethod ?? null,
      paymentAmounts: submission.paymentAmounts ?? null,
      source: submission.submissionSource ?? DigitalEnrollmentSubmissionSource.INVITATION,
      isVoided: Boolean(submission.voidedAt),
      voidedAt: submission.voidedAt,
      voidReason: submission.voidReason,
      voidedByUserId: submission.voidedByUserId,
      convertedAt: submission.convertedAt,
      completionNote: submission.completionNote ?? null,
      createdOn: submission.createdOn,
      updatedOn: submission.updatedOn,
    };
  }

  private async toPublicPdfResponse(submission: DigitalEnrollmentSubmission) {
    const enrollmentPackage = await this.getEnrollmentPackageDetails(submission);
    const location = await this.locationRepository.getLocationDetails(submission.locationId);
    const policySections = await this.enrolmentPolicyService.resolveSignedPolicySections(
      submission.policySnapshot,
    );

    return {
      id: submission.id,
      locationId: submission.locationId,
      locationSlug: submission.locationSlug,
      locationPhone: this.stringValue(location?.phoneNumber),
      locationAddress: this.stringValue(location?.address),
      status: submission.status,
      student: submission.studentData,
      guardians: submission.guardianData,
      programPreference: submission.programPreferenceData,
      schedulePreference: submission.schedulePreferenceData,
      feeSnapshot: submission.feeSnapshotData,
      parentPreference: submission.parentPreferenceData ?? {},
      additionalStudents: await this.buildAdditionalStudentsResponse(submission),
      policies: submission.policyAcknowledgementData,
      policySections,
      signature: {
        printedName: submission.signaturePrintedName,
        signedDate: submission.signatureSignedDate,
        dataUrl: submission.signatureDataUrl,
      },
      submittedAt: submission.submittedAt,
      linkedEnrolmentId: submission.linkedEnrolmentId,
      linkedCourseId: submission.linkedCourseId,
      enrollmentPackage,
      paymentMethod: submission.paymentMethod ?? null,
      paymentAmounts: submission.paymentAmounts ?? null,
    };
  }
}
