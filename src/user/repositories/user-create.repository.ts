import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { UserContact } from '../entities/user-contact.entity';
import { UserEmail } from '../entities/user-email.entity';
import { UserLocation } from '../entities/user-location.entity';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from '../../auth/entities/rbac-auth-item.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { CustomerEmailNotification } from '../../customer/entities/customer-email-notification.entity';
import { NotificationEmailType } from '../../customer/entities/notification-email-type.entity';
import { ReleaseNotes } from '../../release-notes/entities/release-notes.entity';
import { ReleaseNotesRead } from '../../release-notes/entities/release-notes-read.entity';
import { RolesEnum } from '../../auth/enums/roles.enum';
import * as crypto from 'crypto';

export interface CreateUserData {
  username?: string;
  passwordHash?: string;
  pinHash?: string;
  status: number;
  canLogin: boolean;
  canMerge: boolean;
  authKey: string;
  accessToken: string;
}

export interface CreateUserProfileData {
  firstname: string;
  lastname: string;
  locale: string;
}

@Injectable()
export class UserCreateRepository {
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
    @InjectRepository(CustomerAccount)
    private readonly customerAccountRepository: Repository<CustomerAccount>,
    @InjectRepository(CustomerEmailNotification)
    private readonly customerEmailNotificationRepository: Repository<CustomerEmailNotification>,
    @InjectRepository(NotificationEmailType)
    private readonly notificationEmailTypeRepository: Repository<NotificationEmailType>,
    @InjectRepository(ReleaseNotes)
    private readonly releaseNotesRepository: Repository<ReleaseNotes>,
    @InjectRepository(ReleaseNotesRead)
    private readonly releaseNotesReadRepository: Repository<ReleaseNotesRead>,
  ) {}

  /**
   * Check if email exists in location
   * Replicates legacy UserEmail::validateUnique()
   */
  async checkEmailExists(email: string, locationId: number, manager: EntityManager): Promise<boolean> {
    const existingEmail = await manager
      .createQueryBuilder(UserEmail, 'userEmail')
      .leftJoin('userEmail.userContact', 'userContact')
      .leftJoin('userContact.user', 'user')
      .leftJoin('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('userEmail.email = :email', { email })
      .andWhere('userEmail.isDeleted = :emailDeleted', { emailDeleted: false })
      .andWhere('userContact.isDeleted = :contactDeleted', { contactDeleted: false })
      .andWhere('user.isDeleted = :userDeleted', { userDeleted: false })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .getOne();

    return !!existingEmail;
  }

  /**
   * Check if PIN exists in location
   * Replicates legacy UserForm::validatePin()
   */
  async checkPinExists(pin: number, locationId: number, manager: EntityManager): Promise<boolean> {
    const pinHash = crypto.createHash('md5').update(pin.toString()).digest('hex');
    
    const existingUser = await manager
      .createQueryBuilder(User, 'user')
      .leftJoin('user.userLocation', 'userLocation')
      .where('user.pin_hash = :pinHash', { pinHash })
      .andWhere('user.isDeleted = :deleted', { deleted: false })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .getOne();

    return !!existingUser;
  }

  /**
   * Create User entity
   */
  async createUser(userData: CreateUserData, manager: EntityManager): Promise<User> {
    const user = new User();
    if (userData.username) user.username = userData.username;
    user.auth_key = userData.authKey;
    user.access_token = userData.accessToken;
    if (userData.passwordHash) user.password_hash = userData.passwordHash;
    if (userData.pinHash) user.pin_hash = userData.pinHash;
    user.status = userData.status;
    user.canLogin = userData.canLogin;
    user.canMerge = userData.canMerge;
    user.isDeleted = false;
    user.created_at = Math.floor(Date.now() / 1000);
    user.updated_at = Math.floor(Date.now() / 1000);

    return await manager.save(User, user);
  }

  /**
   * Create CustomerAccount for user
   */
  async createCustomerAccount(userId: number, manager: EntityManager): Promise<CustomerAccount> {
    const customerAccount = new CustomerAccount();
    customerAccount.customerId = userId;
    customerAccount.balance = 0;
    customerAccount.createdByUserId = userId;
    customerAccount.updatedByUserId = userId;

    return await manager.save(CustomerAccount, customerAccount);
  }

  /**
   * Create UserProfile with locale only
   */
  async createUserProfile(userId: number, locale: string, manager: EntityManager): Promise<UserProfile> {
    const userProfile = new UserProfile();
    userProfile.userId = userId;
    userProfile.locale = locale;

    return await manager.save(UserProfile, userProfile);
  }

  /**
   * Update UserProfile with firstname and lastname
   */
  async updateUserProfile(
    userProfile: UserProfile,
    profileData: CreateUserProfileData,
    manager: EntityManager,
  ): Promise<UserProfile> {
    userProfile.firstname = profileData.firstname.trim();
    userProfile.lastname = profileData.lastname.trim();

    return await manager.save(UserProfile, userProfile);
  }

  /**
   * Assign role to user via RBAC
   * Replicates legacy: $auth->revokeAll() then $auth->assign()
   */
  async assignRole(userId: number, role: RolesEnum, manager: EntityManager): Promise<void> {
    // Revoke all existing roles
    await manager.delete(RbacAuthAssignment, { user_id: userId.toString() });

    // Get role item
    const roleItem = await manager.findOne(RbacAuthItem, {
      where: { name: role, type: 1 }, // type 1 = role
    });

    if (!roleItem) {
      throw new BadRequestException(`Role ${role} not found in RBAC system`);
    }

    // Assign new role
    const assignment = new RbacAuthAssignment();
    assignment.user_id = userId.toString();
    assignment.item_name = role;
    assignment.created_at = Math.floor(Date.now() / 1000);

    await manager.save(RbacAuthAssignment, assignment);
  }

  /**
   * Create UserLocation
   */
  async createUserLocation(userId: number, locationId: number, manager: EntityManager): Promise<UserLocation> {
    const userLocation = new UserLocation();
    userLocation.userId = userId;
    userLocation.locationId = locationId;

    return await manager.save(UserLocation, userLocation);
  }

  /**
   * Get all NotificationEmailType
   */
  async getAllNotificationEmailTypes(manager: EntityManager): Promise<NotificationEmailType[]> {
    return await manager.find(NotificationEmailType);
  }

  /**
   * Create CustomerEmailNotification entry
   */
  async createCustomerEmailNotification(
    userId: number,
    emailNotificationTypeId: number,
    manager: EntityManager,
  ): Promise<CustomerEmailNotification> {
    const customerEmailNotification = new CustomerEmailNotification();
    customerEmailNotification.userId = userId;
    customerEmailNotification.emailNotificationTypeId = emailNotificationTypeId;
    customerEmailNotification.isChecked = 0; // 0 = false

    return await manager.save(CustomerEmailNotification, customerEmailNotification);
  }

  /**
   * Get all non-deleted ReleaseNotes
   */
  async getAllReleaseNotes(manager: EntityManager): Promise<ReleaseNotes[]> {
    return await manager.find(ReleaseNotes, {
      where: { isDeleted: false },
    });
  }

  /**
   * Create ReleaseNotesRead entry
   */
  async createReleaseNotesRead(
    userId: number,
    releaseNoteId: number,
    manager: EntityManager,
  ): Promise<ReleaseNotesRead> {
    const releaseNoteRead = new ReleaseNotesRead();
    releaseNoteRead.releaseNoteId = releaseNoteId;
    releaseNoteRead.userId = userId;
    releaseNoteRead.isRead = 0;
    releaseNoteRead.isDeleted = false;

    return await manager.save(ReleaseNotesRead, releaseNoteRead);
  }

  /**
   * Create UserContact
   */
  async createUserContact(userId: number, manager: EntityManager): Promise<UserContact> {
    const userContact = new UserContact();
    userContact.userId = userId;
    userContact.labelId = UserContact.LABEL_WORK;
    userContact.isPrimary = true;
    userContact.isDeleted = false;

    return await manager.save(UserContact, userContact);
  }

  /**
   * Create UserEmail
   */
  async createUserEmail(email: string, userContactId: number, manager: EntityManager): Promise<UserEmail> {
    const userEmail = new UserEmail();
    userEmail.email = email.trim();
    userEmail.userContactId = userContactId;
    userEmail.isDeleted = false;

    return await manager.save(UserEmail, userEmail);
  }
}

