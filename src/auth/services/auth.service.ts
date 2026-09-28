import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { RbacAuthAssignment } from '../entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from '../entities/rbac-auth-item.entity';
import { RbacAuthRule } from '../entities/rbac-auth-rule.entity';
import { CacheService } from '../../cache/cache.service';
import { resolvePortalUserIdByLocation } from '../../shared/services/portal-user.helper';

export interface AuthenticatedUser {
  id: number;
  username: string;
  access_token: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    @InjectRepository(RbacAuthItem)
    private readonly itemRepository: Repository<RbacAuthItem>,
    @InjectRepository(RbacAuthRule)
    private readonly ruleRepository: Repository<RbacAuthRule>,
    private readonly cacheService: CacheService,
  ) {}

  private readonly tokenCacheTtlSeconds = 300;

  async validateToken(accessToken: string): Promise<AuthenticatedUser> {
    const cacheKey = this.getTokenCacheKey(accessToken);

    try {
      const cachedUser = await this.cacheService.get<AuthenticatedUser>(cacheKey);
      if (cachedUser) {
        return cachedUser;
      }

      // Find user by access_token
      const user = await this.userRepository.findOne({
        where: {
          access_token: accessToken,
          isDeleted: false,
          canLogin: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      // Get user roles from RBAC
      const roleAssignments = await this.assignmentRepository.find({
        where: { user_id: user.id.toString() },
        relations: ['item'],
      });

      const roles = roleAssignments.map((assignment) => assignment.item?.name).filter((role) => role !== undefined);

      const authenticatedUser: AuthenticatedUser = {
        id: user.id,
        username: user.username,
        access_token: user.access_token,
        roles,
      };

      await this.cacheService.set(cacheKey, authenticatedUser, this.tokenCacheTtlSeconds);

      return authenticatedUser;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token validation failed');
    }
  }

  async resolvePortalUserId(
    userId: number,
    locationId: number,
  ): Promise<number | null> {
    return resolvePortalUserIdByLocation(this.userRepository, userId, locationId);
  }

  async getUserRoles(userId: number): Promise<string[]> {
    try {
      const roleAssignments = await this.assignmentRepository.find({
        where: { user_id: userId.toString() },
        relations: ['item'],
      });

      return roleAssignments
        .map(assignment => assignment.item?.name)
        .filter(role => role !== undefined);
    } catch (error) {
      throw new Error(`Failed to get user roles: ${error.message}`);
    }
  }

  async hasRole(userId: number, requiredRole: string): Promise<boolean> {
    try {
      const userRoles = await this.getUserRoles(userId);
      return userRoles.includes(requiredRole);
    } catch (error) {
      return false;
    }
  }

  async hasAnyRole(userId: number, requiredRoles: string[]): Promise<boolean> {
    try {
      const userRoles = await this.getUserRoles(userId);
      return requiredRoles.some(role => userRoles.includes(role));
    } catch (error) {
      return false;
    }
  }

  private getTokenCacheKey(accessToken: string): string {
    return `auth:token:${accessToken}`;
  }
}
