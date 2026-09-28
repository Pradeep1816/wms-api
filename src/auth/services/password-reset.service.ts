import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { MailerService } from '../../shared/services/mailer.service';
import { UserLocation } from '../../user/entities/user-location.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { User } from '../../user/entities/user.entity';
import { PasswordResetDto } from '../dto/password-reset.dto';
import { PasswordResetRequestDto } from '../dto/password-reset-request.dto';
import { RbacAuthAssignment } from '../entities/rbac-auth-assignment.entity';
import { UserToken } from '../entities/user-token.entity';
import { RolesEnum } from '../enums/roles.enum';

type ResetPortal = 'admin' | 'user';

type PasswordResetCandidate = {
  user_id: number;
  email: string;
  firstname: string | null;
  lastname: string | null;
  status: number;
  canLogin: number;
};

@Injectable()
export class PasswordResetService {
  private readonly tokenLength = 40;
  private readonly tokenDurationSeconds = 24 * 60 * 60;
  private readonly backendRoles = [
    RolesEnum.ADMINISTRATOR,
    RolesEnum.OWNER,
    RolesEnum.STAFFMEMBER,
  ];
  private readonly userRoles = [RolesEnum.CUSTOMER, RolesEnum.TEACHER];

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserToken)
    private readonly userTokenRepository: Repository<UserToken>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    private readonly mailerService: MailerService,
  ) {}

  async requestReset(
    portal: ResetPortal,
    dto: PasswordResetRequestDto,
  ): Promise<{ status: true }> {
    const email = dto.email.trim().toLowerCase();
    const allowedRoles = this.getAllowedPortalRoles(portal);
    const candidate = await this.findCandidateByPrimaryEmail(
      email,
      allowedRoles,
    );

    if (!candidate) {
      throw new BadRequestException('There is no user with such primary email.');
    }

    const roles = await this.getUserRoles(candidate.user_id);
    this.validatePortalRoles(portal, roles);
    this.validateResetAccess(candidate);

    const location = await this.resolveFromLocation(candidate.user_id, roles);
    const token = await this.createPasswordResetToken(candidate.user_id);
    const subject = 'Password reset for Arcadia Academy of Music';
    const from = location.email || process.env.FROM_MAIL_USER || '';
    const html = this.buildPasswordResetEmail(portal, candidate, token.token);

    await this.mailerService.sendEmail({
      from,
      to: [email],
      subject,
      html,
    });

    return { status: true };
  }

  async validateResetToken(token: string): Promise<{ valid: true }> {
    const validToken = await this.getValidToken(token);
    await this.ensureResetAllowed(validToken.userId);

    return { valid: true };
  }

  async resetPassword(dto: PasswordResetDto): Promise<{ status: true }> {
    const confirmPassword = dto.confirmPassword ?? dto.reenterpassword;
    if (confirmPassword !== dto.password) {
      throw new BadRequestException("Confirm Password doesn't match with the password");
    }

    const token = await this.getValidToken(dto.token);
    await this.ensureResetAllowed(token.userId);
    const passwordHash = await bcrypt.hash(dto.password, 13);

    await this.userRepository.update(token.userId, {
      password_hash: this.normalizeYiiBcryptHash(passwordHash),
    });
    await this.userTokenRepository.delete({ id: token.id });

    return { status: true };
  }

  private async findCandidateByPrimaryEmail(
    email: string,
    allowedRoles: RolesEnum[],
  ): Promise<PasswordResetCandidate | null> {
    const row = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user_contact', 'contact', 'contact.userId = user.id')
      .innerJoin('user_email', 'email', 'email.userContactId = contact.id')
      .innerJoin(
        'rbac_auth_assignment',
        'assignment',
        'assignment.user_id = CAST(user.id AS CHAR)',
      )
      .leftJoin(UserProfile, 'profile', 'profile.user_id = user.id')
      .select('user.id', 'user_id')
      .addSelect('email.email', 'email')
      .addSelect('profile.firstname', 'firstname')
      .addSelect('profile.lastname', 'lastname')
      .addSelect('user.status', 'status')
      .addSelect('user.canLogin', 'canLogin')
      .where('LOWER(email.email) = :email', { email })
      .andWhere('contact.isPrimary = 1')
      .andWhere('contact.isDeleted = 0')
      .andWhere('email.isDeleted = 0')
      .andWhere('user.isDeleted = 0')
      .andWhere('assignment.item_name IN (:...allowedRoles)', {
        allowedRoles,
      })
      .orderBy('user.id', 'ASC')
      .limit(1)
      .getRawOne<PasswordResetCandidate>();

    return row || null;
  }

  private async getUserRoles(userId: number): Promise<string[]> {
    const assignments = await this.assignmentRepository.find({
      where: { user_id: userId.toString() },
      select: ['item_name'],
    });

    return assignments.map((assignment) => assignment.item_name);
  }

  private validatePortalRoles(portal: ResetPortal, roles: string[]) {
    const allowedRoles = this.getAllowedPortalRoles(portal);
    const hasAllowedRole = roles.some((role) => allowedRoles.includes(role as RolesEnum));

    if (!hasAllowedRole) {
      throw new BadRequestException('Sorry, we are unable to reset password for email provided');
    }
  }

  private validateResetAccess(candidate: PasswordResetCandidate) {
    const canLogin = Boolean(Number(candidate.canLogin));
    if (Number(candidate.status) !== User.STATUS_ACTIVE || !canLogin) {
      throw new BadRequestException('There is no user with such primary email.');
    }
  }

  private async ensureResetAllowed(userId: number): Promise<void> {
    const roles = await this.getUserRoles(userId);
    const hasResetPortalRole = roles.some(
      (role) =>
        this.userRoles.includes(role as RolesEnum) ||
        this.backendRoles.includes(role as RolesEnum),
    );
    if (!hasResetPortalRole) {
      return;
    }

    const account = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
      select: ['id', 'status', 'canLogin'],
    });

    if (!account || Number(account.status) !== User.STATUS_ACTIVE || !account.canLogin) {
      throw new BadRequestException('Wrong password reset token.');
    }
  }

  private getAllowedPortalRoles(portal: ResetPortal): RolesEnum[] {
    return portal === 'admin' ? this.backendRoles : this.userRoles;
  }

  private async resolveFromLocation(userId: number, roles: string[]): Promise<Location> {
    if (roles.includes(RolesEnum.ADMINISTRATOR)) {
      const defaultLocation = await this.locationRepository.findOne({
        where: { id: 1, isDeleted: false },
      });

      if (defaultLocation) {
        return defaultLocation;
      }
    }

    const userLocation = await this.userLocationRepository.findOne({
      where: { userId },
      relations: ['location'],
      order: { id: 'ASC' },
    });

    if (userLocation?.location && !userLocation.location.isDeleted) {
      return userLocation.location;
    }

    const fallbackLocation = await this.locationRepository.findOne({
      where: { isDeleted: false },
      order: { id: 'ASC' },
    });

    if (!fallbackLocation) {
      throw new BadRequestException('Sorry, we are unable to reset password for email provided');
    }

    return fallbackLocation;
  }

  private async createPasswordResetToken(userId: number): Promise<UserToken> {
    const now = Math.floor(Date.now() / 1000);
    const token = this.userTokenRepository.create({
      userId,
      type: UserToken.TYPE_PASSWORD_RESET,
      token: this.generateRandomString(this.tokenLength),
      expireAt: now + this.tokenDurationSeconds,
      createdAt: now,
      updatedAt: now,
    });

    return this.userTokenRepository.save(token);
  }

  private async getValidToken(token: string): Promise<UserToken> {
    const row = await this.userTokenRepository
      .createQueryBuilder('token')
      .where('token.token = :token', { token })
      .andWhere('token.type = :type', { type: UserToken.TYPE_PASSWORD_RESET })
      .andWhere('token.expireAt > :now', { now: Math.floor(Date.now() / 1000) })
      .getOne();

    if (!row) {
      throw new BadRequestException('Wrong password reset token.');
    }

    return row;
  }

  private buildPasswordResetEmail(
    portal: ResetPortal,
    candidate: PasswordResetCandidate,
    token: string,
  ): string {
    const publicIdentity = this.escapeHtml(
      [candidate.firstname, candidate.lastname].filter(Boolean).join(' ').trim() ||
        candidate.email,
    );
    const resetLink = this.getResetLink(portal, token);
    const academyName =
      portal === 'admin' ? 'Arcadia Academy of Music' : 'Arcadia Music Academy';

    return [
      `Dear ${publicIdentity},<br>`,
      '<br>',
      `You have requested to reset your password for your ${academyName} account.<br>`,
      '<br>',
      'If you follow the link below you will be able to reset your password:',
      ` <a href="${resetLink}">${resetLink}</a><br>`,
      '<br>',
      '(NOTE:This link can be used just once and is scheduled to expire after 24 hours.)<br>',
      '<br>',
      "If you didn't make this request then you can safely ignore this email.<br>",
      '<br>',
      'Thank you<br>',
      `${academyName} Team.<br>`,
    ].join('');
  }

  private getResetLink(portal: ResetPortal, token: string): string {
    const baseUrl = this.getV2BaseUrl();
    const path =
      portal === 'admin'
        ? '/admin/reset-password'
        : '/user/sign-in/reset-password';

    return `${baseUrl}${path}?token=${encodeURIComponent(token)}`;
  }

  private getV2BaseUrl(): string {
    const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

    return baseUrl.endsWith('/v2') ? baseUrl : `${baseUrl}/v2`;
  }

  private generateRandomString(length: number): string {
    return randomBytes(length)
      .toString('base64url')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, length);
  }

  private normalizeYiiBcryptHash(hash: string): string {
    return hash.replace(/^\$2[ab]\$/, '$2y$');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
