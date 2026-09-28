import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
// import { createHmac } from 'crypto';
import { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { User } from '../../user/entities/user.entity';
import { RbacAuthAssignment } from '../entities/rbac-auth-assignment.entity';
import { UserLoginDto } from '../dto/user-login.dto';
import { UserLoginResponseDto } from '../dto/user-login-response.dto';
import { RolesEnum } from '../enums/roles.enum';

type UserLoginCandidate = {
  user_id: number;
  access_token: string;
  // auth_key: string;
  password_hash: string | null;
  email: string;
  status: number;
  canLogin: number;
};

type MatchingUserCandidate = {
  candidate: UserLoginCandidate;
  roles: string[];
};

/* export type FrontendIdentityCookie = {
  value: string;
  expires?: Date;
};

type UserLoginResult = UserLoginResponseDto & {
  identityCookie?: FrontendIdentityCookie;
}; */

@Injectable()
export class UserSignInService {
  private readonly userRoles = [RolesEnum.CUSTOMER, RolesEnum.TEACHER];
  private readonly modernUserPortalLocations = [
    'training-location',
    'burlington',
  ];
  // private readonly rememberMeDuration = 30 * 24 * 60 * 60;
  private readonly inactiveAccountMessage =
    'Your account is inactive. Please contact the office.';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  async login(dto: UserLoginDto): Promise<UserLoginResponseDto> {
    const identity = dto.identity.trim().toLowerCase();
    const candidates = await this.findUserCandidatesByPrimaryEmail(identity);

    if (candidates.length === 0) {
      throw new ForbiddenException('You are not allowed to login.');
    }

    const matchedCandidate = await this.findMatchingCandidate(
      candidates,
      dto.password,
    );
    if (!matchedCandidate) {
      throw new UnauthorizedException('Incorrect username or password.');
    }

    const { candidate, roles } = matchedCandidate;
    const userRoles = roles.filter((role) =>
      this.userRoles.includes(role as RolesEnum),
    );

    if (userRoles.length === 0) {
      throw new ForbiddenException('You are not allowed to login.');
    }

    if (
      userRoles.length > 0 &&
      (Number(candidate.status) !== User.STATUS_ACTIVE ||
        !Number(candidate.canLogin))
    ) {
      throw new ForbiddenException(this.inactiveAccountMessage);
    }

    const selectedRole = this.selectPrimaryUserRole(userRoles);
    const location = await this.resolveUserLocation(candidate.user_id);
    const isModernUserPortalEnabled = this.modernUserPortalLocations.includes(
      location.slug,
    );

    await this.userRepository.update(candidate.user_id, {
      logged_at: Math.floor(Date.now() / 1000),
    });

    return {
      token: candidate.access_token,
      accessToken: candidate.access_token,
      location: location.slug,
      id: candidate.user_id,
      user: {
        id: candidate.user_id,
        role: selectedRole,
        roles,
        email: candidate.email,
      },
      isModernUserPortalEnabled,
      redirectUrl: `/user/${location.slug}/schedule`,
      // legacyRedirectUrl: `/${location.slug}/schedule/index`,
      /* identityCookie: this.createIdentityCookie(
        candidate.user_id,
        candidate.auth_key,
        dto.rememberMe,
      ), */
    };
  }

  async logout(): Promise<{ status: true }> {
    return { status: true };
  }

  private async findUserCandidatesByPrimaryEmail(
    identity: string,
  ): Promise<UserLoginCandidate[]> {
    return this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user_contact', 'contact', 'contact.userId = user.id')
      .innerJoin('user_email', 'email', 'email.userContactId = contact.id')
      .select('user.id', 'user_id')
      .addSelect('user.access_token', 'access_token')
      // .addSelect('user.auth_key', 'auth_key')
      .addSelect('user.password_hash', 'password_hash')
      .addSelect('user.status', 'status')
      .addSelect('user.canLogin', 'canLogin')
      .addSelect('email.email', 'email')
      .where('LOWER(email.email) = :identity', { identity })
      .andWhere('contact.isPrimary = 1')
      .andWhere('contact.isDeleted = 0')
      .andWhere('email.isDeleted = 0')
      .andWhere('user.isDeleted = 0')
      .orderBy('user.id', 'ASC')
      .getRawMany<UserLoginCandidate>();
  }

  private async findMatchingCandidate(
    candidates: UserLoginCandidate[],
    password: string,
  ): Promise<MatchingUserCandidate | null> {
    let inactiveUserMatch: MatchingUserCandidate | null = null;
    let passwordMatchWithoutAllowedRole: MatchingUserCandidate | null = null;

    for (const candidate of candidates) {
      if (!candidate.password_hash) {
        continue;
      }

      const passwordMatches = await bcrypt.compare(
        password,
        this.normalizeBcryptHash(candidate.password_hash),
      );

      if (!passwordMatches) {
        continue;
      }

      const roles = await this.getUserRoles(candidate.user_id);
      const userRoles = roles.filter((role) =>
        this.userRoles.includes(role as RolesEnum),
      );

      if (userRoles.length > 0) {
        const match = { candidate, roles };
        const canLogin =
          Number(candidate.status) === User.STATUS_ACTIVE &&
          Boolean(Number(candidate.canLogin));

        if (canLogin) {
          return match;
        }

        inactiveUserMatch = inactiveUserMatch ?? match;
        continue;
      }

      passwordMatchWithoutAllowedRole = passwordMatchWithoutAllowedRole ?? {
        candidate,
        roles,
      };
    }

    if (inactiveUserMatch) {
      const activeRelatedMatch = await this.findActiveRelatedCandidate(
        candidates,
        inactiveUserMatch,
      );

      return activeRelatedMatch ?? inactiveUserMatch;
    }

    return passwordMatchWithoutAllowedRole;
  }

  private async findActiveRelatedCandidate(
    candidates: UserLoginCandidate[],
    inactiveMatch: MatchingUserCandidate,
  ): Promise<MatchingUserCandidate | null> {
    const inactiveUserRoles = inactiveMatch.roles.filter((role) =>
      this.userRoles.includes(role as RolesEnum),
    );

    for (const candidate of candidates) {
      const canLogin =
        Number(candidate.status) === User.STATUS_ACTIVE &&
        Boolean(Number(candidate.canLogin));

      if (!canLogin || candidate.user_id === inactiveMatch.candidate.user_id) {
        continue;
      }

      const roles = await this.getUserRoles(candidate.user_id);
      const hasRelatedRole = roles.some((role) =>
        inactiveUserRoles.includes(role),
      );

      if (hasRelatedRole) {
        return { candidate, roles };
      }
    }

    return null;
  }

  private async getUserRoles(userId: number): Promise<string[]> {
    const assignments = await this.assignmentRepository.find({
      where: { user_id: userId.toString() },
      select: ['item_name'],
    });

    return assignments.map((assignment) => assignment.item_name);
  }

  private selectPrimaryUserRole(roles: string[]): string {
    const priority = [RolesEnum.TEACHER, RolesEnum.CUSTOMER];
    return priority.find((role) => roles.includes(role)) || roles[0];
  }

  private async resolveUserLocation(userId: number): Promise<Location> {
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
      throw new ForbiddenException(
        'No active location is available for this user.',
      );
    }

    return fallbackLocation;
  }

  /* private createIdentityCookie(
    userId: number,
    authKey: string,
    rememberMe?: boolean,
  ): FrontendIdentityCookie | undefined {
    const validationKey = process.env.FRONTEND_COOKIE_VALIDATION_KEY;
    if (!validationKey) {
      return undefined;
    }

    const duration = rememberMe ? this.rememberMeDuration : 0;
    const value = JSON.stringify([userId, authKey, duration]);

    return {
      value: this.createYiiSignedCookieValue('_identity', value, validationKey),
      expires: rememberMe
        ? new Date(Date.now() + this.rememberMeDuration * 1000)
        : undefined,
    };
  }

  private createYiiSignedCookieValue(
    cookieName: string,
    value: string,
    validationKey: string,
  ): string {
    const serialized = this.phpSerializeArray([cookieName, value]);
    const hash = createHmac('sha256', validationKey)
      .update(serialized)
      .digest('hex');

    return `${hash}${serialized}`;
  }

  private phpSerializeArray(values: string[]): string {
    const entries = values
      .map((value, index) => `i:${index};${this.phpSerializeString(value)}`)
      .join('');

    return `a:${values.length}:{${entries}}`;
  }

  private phpSerializeString(value: string): string {
    return `s:${Buffer.byteLength(value, 'utf8')}:"${value}";`;
  }

  } */

  private normalizeBcryptHash(hash: string): string {
    return hash.replace(/^\$2y\$/, '$2a$');
  }
}
