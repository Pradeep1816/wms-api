import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationService } from '../../location/services/location.service';
import { UserCreateRepository } from '../repositories/user-create.repository';
import { User } from '../entities/user.entity';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserCreateService {
  constructor(
    private readonly userCreateRepository: UserCreateRepository,
    private readonly locationService: LocationService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new user with the specified role
   * Replicates legacy UserController::actionCreate() logic
   */
  async createUser(
    locationSlug: string,
    role: RolesEnum,
    createDto: CreateUserDto,
    currentUserId?: number,
  ): Promise<{ id: number; legacyUrl: string }> {
    // Validate password match if both provided
    if (createDto.password && createDto.confirmPassword) {
      if (createDto.password !== createDto.confirmPassword) {
        throw new BadRequestException("Confirm Password doesn't match with the password");
      }
    }

    // Validate email is required for ADMINISTRATOR and OWNER roles
    if ((role === RolesEnum.ADMINISTRATOR || role === RolesEnum.OWNER) && !createDto.email) {
      throw new BadRequestException('Email is required for administrator and owner roles');
    }

    // Get location ID
    const locationId = await this.locationService.getLocationId(locationSlug);
    if (!locationId) {
      throw new NotFoundException(`Location with slug ${locationSlug} not found`);
    }

    // Use transaction to ensure atomicity
    return await this.dataSource.transaction(async (manager) => {
      if (manager.queryRunner && currentUserId) {
        manager.queryRunner.data.currentUserId = currentUserId;
      }

      // Validate email uniqueness if provided
      if (createDto.email) {
        const emailExists = await this.userCreateRepository.checkEmailExists(createDto.email, locationId, manager);
        if (emailExists) {
          throw new BadRequestException('Email already exists!');
        }
      }

      // Validate PIN uniqueness if provided
      if (createDto.pin) {
        const pinExists = await this.userCreateRepository.checkPinExists(createDto.pin, locationId, manager);
        if (pinExists) {
          throw new BadRequestException('Try different pin.');
        }
      }

      // Determine canLogin based on role
      const canLogin = role !== RolesEnum.STAFFMEMBER;

      // Determine status based on role
      const status = role === RolesEnum.CUSTOMER ? User.STATUS_NOT_ACTIVE : User.STATUS_ACTIVE;

      // Generate auth_key and access_token
      const authKey = this.generateRandomString();
      const accessToken = this.generateRandomString(40);

      // Hash password if provided
      // Use bcryptjs to generate proper bcrypt hash compatible with Yii2
      // bcryptjs generates $2a$, $2b$, or $2x$ format, but Yii2 expects $2y$
      // Replace any bcrypt variant ($2a$, $2b$, $2x$) with $2y$ to match Yii2's expected format
      // This is safe because all bcrypt variants use the same algorithm, only the prefix differs
      let passwordHash: string | undefined;
      if (createDto.password) {
        const hash = await bcrypt.hash(createDto.password, 10);
        passwordHash = hash.replace(/^\$2[abx]\$/, '$2y$');
      }

      // Hash PIN if provided (MD5 for legacy compatibility)
      let pinHash: string | undefined;
      if (createDto.pin) {
        pinHash = crypto.createHash('md5').update(createDto.pin.toString()).digest('hex');
      }

      // Step 1: Create User (SQL Query #5)
      const savedUser = await this.userCreateRepository.createUser(
        {
          username: createDto.username,
          passwordHash,
          pinHash,
          status,
          canLogin,
          canMerge: createDto.canMerge ?? false,
          authKey,
          accessToken,
        },
        manager,
      );

      // Step 2: Create CustomerAccount for ALL users (SQL Query #7)
      await this.userCreateRepository.createCustomerAccount(savedUser.id, manager);

      // Step 3: Create UserProfile with locale only (SQL Query #10)
      const userProfile = await this.userCreateRepository.createUserProfile(savedUser.id, 'en-US', manager);

      // Step 4: Assign role via RBAC (SQL Query #11)
      await this.userCreateRepository.assignRole(savedUser.id, role, manager);

      // Step 5: Create UserLocation (except for ADMINISTRATOR) (SQL Query #13)
      if (role !== RolesEnum.ADMINISTRATOR) {
        await this.userCreateRepository.createUserLocation(savedUser.id, locationId, manager);
      }

      // Step 6: Update UserProfile with firstname and lastname (SQL Query #14)
      await this.userCreateRepository.updateUserProfile(
        userProfile,
        {
          firstname: createDto.firstname,
          lastname: createDto.lastname,
          locale: 'en-US',
        },
        manager,
      );

      // Step 7: Create CustomerEmailNotification entries for all NotificationEmailType (SQL Query #16)
      const emailNotificationTypes = await this.userCreateRepository.getAllNotificationEmailTypes(manager);
      for (const notificationType of emailNotificationTypes) {
        await this.userCreateRepository.createCustomerEmailNotification(
          savedUser.id,
          notificationType.id,
          manager,
        );
      }

      // Step 8: Create ReleaseNotesRead entries for non-customer roles (SQL Query #18)
      if (role !== RolesEnum.CUSTOMER) {
        const releaseNotes = await this.userCreateRepository.getAllReleaseNotes(manager);
        for (const releaseNote of releaseNotes) {
          await this.userCreateRepository.createReleaseNotesRead(savedUser.id, releaseNote.id, manager);
        }
      }

      // Step 9: Create email and contact if email provided (SQL Queries #19, #21)
      if (createDto.email) {
        const savedContact = await this.userCreateRepository.createUserContact(savedUser.id, manager);
        await this.userCreateRepository.createUserEmail(createDto.email, savedContact.id, manager);
      }

      return {
        id: savedUser.id,
        legacyUrl: `/admin/v2/${locationSlug}/user/view?role_name=${role}&id=${savedUser.id}`,
      };
    });
  }

  /**
   * Generate random string for auth_key and access_token
   * Replicates Yii2's generateRandomString()
   */
  private generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
  }
}
