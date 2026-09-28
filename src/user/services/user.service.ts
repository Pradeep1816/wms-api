import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { UserContact } from '../entities/user-contact.entity';
import { UserEmail } from '../entities/user-email.entity';
import { UserLocation } from '../entities/user-location.entity';
import { UserResponseDto } from '../dto/user-response.dto';
import {
  BaseUserDataDto,
  CustomerUserDataDto,
  TeacherUserDataDto,
  AdminUserDataDto,
  UserListDataDto,
} from '../dto/user-list-response.dto';
import { plainToClass } from 'class-transformer';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from '../../auth/entities/rbac-auth-item.entity';
import { UserListRepository } from '../repositories/user-list.repository';
import { UserDeleteRepository } from '../repositories/user-delete.repository';
import { UserListTransformationService } from './transformations/user-list-transformation.service';
import { UserListRequestDto } from '../dto/user-list-request.dto';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { SetPasswordDto } from '../dto/set-password.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  resolvePortalUserIdByLocation,
  resolveTeacherPortalLocationIds,
} from '../../shared/services/portal-user.helper';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(UserContact)
    private readonly userContactRepository: Repository<UserContact>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    @InjectRepository(RbacAuthItem)
    private readonly itemRepository: Repository<RbacAuthItem>,
    private readonly userListRepository: UserListRepository,
    private readonly userDeleteRepository: UserDeleteRepository,
    private readonly userListTransformationService: UserListTransformationService,
  ) {}

  async findOne(id: number): Promise<UserResponseDto> {
    try {
      // Fetch user
      const user = await this.userRepository.findOne({
        where: { id, isDeleted: false },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Fetch user profile
      const profile = await this.userProfileRepository.findOne({
        where: { userId: id },
      });

      // Fetch user roles
      const roleAssignments = await this.assignmentRepository.find({
        where: { user_id: id.toString() },
        relations: ['item'],
      });

      // Fetch primary contact
      const primaryContact = await this.userContactRepository.findOne({
        where: { userId: id, isPrimary: true, isDeleted: false },
      });

      // Fetch primary email
      let primaryEmail: UserEmail | null = null;
      if (primaryContact) {
        primaryEmail = await this.userEmailRepository.findOne({
          where: { userContactId: primaryContact.id, isDeleted: false },
        });
      }

      // Fetch all other emails (non-primary contacts)
      const otherContacts = await this.userContactRepository.find({
        where: { userId: id, isPrimary: false, isDeleted: false },
      });

      const otherEmails: UserEmail[] = [];
      for (const contact of otherContacts) {
        const emails = await this.userEmailRepository.find({
          where: { userContactId: contact.id, isDeleted: false },
        });
        otherEmails.push(...emails);
      }

      // Fetch user locations
      const userLocations = await this.userLocationRepository.find({
        where: { userId: id },
      });

      // Attach related data to user object
      const userWithRelations = {
        ...user,
        profile,
        roleAssignments,
        primaryEmail,
        emails: otherEmails,
        userLocations,
      };

      const result = plainToClass(UserResponseDto, userWithRelations, {
        excludeExtraneousValues: true,
      });
      
      return result;
    } catch (error) {
      console.error('Error in findOne:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
  }

  async findOneByUsername(username: string): Promise<UserResponseDto> {
    try {
      const user = await this.userRepository.findOne({
        where: { username, isDeleted: false },
      });

      if (!user) {
        throw new NotFoundException(`User with username ${username} not found`);
      }

      return plainToClass(UserResponseDto, user, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
  }

  async findActiveUsers(): Promise<UserResponseDto[]> {
    try {
      const users = await this.userRepository.find({
        where: { isDeleted: false, canLogin: true },
        order: { created_at: 'DESC' },
      });

      return users.map(user =>
        plainToClass(UserResponseDto, user, {
          excludeExtraneousValues: true,
        }),
      );
    } catch (error) {
      throw new Error(`Failed to fetch active users: ${error.message}`);
    }
  }

  async getUserLocations(userId: number, currentLocationId: number): Promise<number[]> {
    try {
      // Get user locations from user_location table
      const userLocations = await this.userLocationRepository.find({
        where: { userId },
      });

      const locationIds = userLocations.map(ul => ul.locationId);

      // Business logic: if current location is not set, return [1], otherwise return [1, user_location_id]
      if (!currentLocationId) {
        return [1];
      } else {
        // Always include location 1, then add user's specific locations if not already included
        const result = [1];
        locationIds.forEach(id => {
          if (id !== 1 && !result.includes(id)) {
            result.push(id);
          }
        });
        return result;
      }
    } catch (error) {
      console.error('Error fetching user locations:', error);
      // Fallback: if current location is 1, return [1], otherwise return [1, currentLocationId]
      return !currentLocationId ? [1] : [1, currentLocationId];
    }
  }

  /**
   * Portal-specific location list for the user portal endpoint.
   * Legacy behavior:
   * - teachers see locations attached to users that share the same primary email
   * - other portal users see the default location plus their current location
   */
  async getPortalUserLocations(
    userId: number,
    currentLocationId: number,
    role: string,
  ): Promise<number[]> {
    try {
      if (role === RolesEnum.TEACHER) {
        return resolveTeacherPortalLocationIds(this.userRepository, userId);
      }

      if (!currentLocationId) {
        return [1];
      }

      const locations = [1];
      if (currentLocationId !== 1) {
        locations.push(currentLocationId);
      }

      return locations;
    } catch (error) {
      console.error('Error fetching portal user locations:', error);

      if (role === RolesEnum.TEACHER) {
        return [];
      }

      return !currentLocationId ? [1] : [1, currentLocationId];
    }
  }

  async resolvePortalUserId(
    userId: number,
    locationId: number,
  ): Promise<number | null> {
    return resolvePortalUserIdByLocation(this.userRepository, userId, locationId);
  }

  /**
   * Check if an email already exists in the specified location
   * This replicates the legacy validateUnique logic from UserEmail model
   * @param email - The email to check
   * @param locationId - The location ID to check within
   * @param role - Optional role to filter by. If not provided, checks all roles
   * @returns true if email exists, false otherwise
   */
  async checkEmailExists(email: string, locationId: number, role?: string): Promise<boolean> {
    try {      
      const queryBuilder = this.userEmailRepository
        .createQueryBuilder('userEmail')
        .leftJoin('userEmail.userContact', 'userContact')
        .leftJoin('userContact.user', 'user')
        .leftJoin('user.userLocation', 'userLocation')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('userEmail.email = :email', { email })
        .andWhere('userEmail.isDeleted = :emailDeleted', { emailDeleted: false })
        .andWhere('userContact.isDeleted = :contactDeleted', { contactDeleted: false })
        .andWhere('user.isDeleted = :userDeleted', { userDeleted: false })
        .andWhere('userLocation.locationId = :locationId', { locationId });

      // If role is provided, filter by that role; otherwise check all roles
      if (role) {
        queryBuilder.andWhere('authAssignment.item_name = :role', { role });
      }

      const existingEmail = await queryBuilder.getOne();

      return !!existingEmail;
    } catch (error) {
      console.error('Error checking email existence:', error);
      // In case of error, assume email doesn't exist to allow creation
      // This prevents blocking legitimate users due to system errors
      return false;
    }
  }

  /**
   * Get users by location and role with pagination
   * Uses repository and transformation service following the module architecture pattern
   * @param locationId - The location ID
   * @param role - The role to filter by (teacher, administrator, staffmember, owner, customer)
   * @param page - Page number
   * @param limit - Items per page
   * @returns UserListResponseDto with users and meta
   */
  async findUsersByLocationAndRole(
    locationId: number,
    query: UserListRequestDto,
  ): Promise<UserListDataDto> {
    try {
      const {
        role = '',
        page = 1,
        limit = 20,
        firstName,
        lastName,
        studentsName,
        email,
        phone,
        balance = 'all',
        showActive = false,
        showInActive = false,
        showAll = false,
        sort = 'lastName',
        order = 'ASC',
      } = query;

      // For student role, use specific parameters
      if (role === RolesEnum.STUDENT) {    
          const studentSearchQuery = {
            page,
            limit,
            firstName,
            lastName,
            customerName: studentsName, // Map studentsName to customerName for student queries
            phoneNumber: phone, // Map phone to phoneNumber
            showActive,
            showInActive,
            showAll: showAll || false,
            sort,
            order,
          };
        
        const { users:students, total } = await this.userListRepository.findUsersByLocationAndRole(
          locationId,
          role,
          studentSearchQuery as any,
        );
        
        // Transform to DTOs based on role
        const usersData = this.userListTransformationService.transformUsersToDtos(students, role);
        
        // Create pagination metadata
        const meta = this.userListTransformationService.createMeta(total, page, limit);
        
        return {
          body: usersData,
          pagination: meta,
        };
      }
    // For other roles e.g, customer, teacher, administrator, staffmember, owner etc. , use the base query
      const requestQuery: UserListRequestDto = {
        page,
        limit,
        firstName,
        lastName,
        studentsName,
        email,
        phone,
        balance,
        showActive,
        showInActive,
        showAll,
        sort,
        order,
      };

      // Get users from repository with pagination, filtering, and sorting
      const { users: rawUsers, total } = await this.userListRepository.findUsersByLocationAndRole(
        locationId,
        role,
        requestQuery,
      );
      // Transform to DTOs based on role
      const usersData = this.userListTransformationService.transformUsersToDtos(rawUsers, role);

      // Create pagination metadata
      const meta = this.userListTransformationService.createMeta(total, page, limit);

      return {
        body: usersData,
        pagination: meta,
      };
    } catch (error) {
      throw new Error(`Failed to fetch users for location ${locationId} with role ${query.role}: ${error.message}`);
    }
  }

  /**
   * Delete a user by role and location
   * @param userId - The user ID to delete
   * @param locationId - The location ID
   * @param role - The role of the user
   * @returns The deleted user
   */
  async deleteUserByRole(
    locationSlug: string,
    userId: number,
    locationId: number,
    role: RolesEnum,
    currentUserId: number,
  ): Promise<User> {
    try {
      return await this.userDeleteRepository.deleteUser(
        locationSlug,
        userId,
        locationId,
        role,
        currentUserId,
      );
    } catch (error) {
      console.error('Error in deleteUserByRole service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`${error.message}`);
    }
  }

  /**
   * Set password, PIN, and/or login access flags for a user
   * @param userId - The user ID
   * @param setPasswordDto - DTO containing password, confirmPassword, optional pin, canLogin, and merge
   * @returns The updated user
   */
  async setPassword(userId: number, setPasswordDto: SetPasswordDto): Promise<User> {
    try {
      // Find user
      const user = await this.userRepository.findOne({
        where: { id: userId, isDeleted: false },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Validate password match if both password and confirmPassword are provided
      if (setPasswordDto.password && setPasswordDto.confirmPassword) {
        if (setPasswordDto.password !== setPasswordDto.confirmPassword) {
          throw new BadRequestException("Confirm Password doesn't match with the password");
        }
      }

      // Hash password if provided and not empty
      if (setPasswordDto.password && setPasswordDto.password.trim() !== '') {
        // Use bcryptjs to generate proper bcrypt hash compatible with Yii2
        // bcryptjs generates $2a$, $2b$, or $2x$ format, but Yii2 expects $2y$
        // Replace any bcrypt variant ($2a$, $2b$, $2x$) with $2y$ to match Yii2's expected format
        // This is safe because all bcrypt variants use the same algorithm, only the prefix differs
        const hash = await bcrypt.hash(setPasswordDto.password, 10);
        user.password_hash = hash.replace(/^\$2[abx]\$/, '$2y$');
      }

      // Hash PIN if provided and not empty
      if (setPasswordDto.pin !== undefined && setPasswordDto.pin !== null) {
        // Hash PIN using MD5 for legacy compatibility (same as user creation)
        user.pin_hash = crypto.createHash('md5').update(setPasswordDto.pin.toString()).digest('hex');
      }

      if (setPasswordDto.canLogin !== undefined) {
        user.canLogin = setPasswordDto.canLogin;
      }

      const mergeFlag = setPasswordDto.merge;

      // Support owner password-form behavior where canMerge is saved from the same action.
      if (mergeFlag !== undefined) {
        user.canMerge = mergeFlag;
      }

      // Update timestamp
      user.updated_at = Math.floor(Date.now() / 1000);

      // Save user
      const updatedUser = await this.userRepository.save(user);

      return updatedUser;
    } catch (error) {
      console.error('Error in setPassword service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(`Failed to set password: ${error.message}`);
    }
  }
}
