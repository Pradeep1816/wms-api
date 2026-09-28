import { FutureLessonNotificationRepair } from '../../lesson/helpers/future-lesson-notification-repair';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository, Brackets } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { Student } from '../../student/entities/student.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { UserEmail } from '../../user/entities/user-email.entity';
import { UserPhone } from '../../user/entities/user-phone.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { CustomerAccount } from '../entities/customer-account.entity';
import { CustomerEmailNotification } from '../entities/customer-email-notification.entity';
import { NotificationEmailType } from '../entities/notification-email-type.entity';
import { CustomerReferralSources } from '../entities/customer-referral-sources.entity';
import { ReferralSourceService } from '../../referral-source/services/referral-source.service';
import { CreateCustomerRequestDto } from '../dto/customer-request.dto';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

@Injectable()
export class CustomerListRepository {
  private static readonly CREDIT_THRESHOLD = -0.09;
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserContact)
    private readonly userContactRepository: Repository<UserContact>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(CustomerAccount)
    private readonly customerAccountRepository: Repository<CustomerAccount>,
    @InjectRepository(CustomerEmailNotification)
    private readonly customerEmailNotificationRepository: Repository<CustomerEmailNotification>,
    @InjectRepository(NotificationEmailType)
    private readonly notificationEmailTypeRepository: Repository<NotificationEmailType>,
    @InjectRepository(CustomerReferralSources)
    private readonly customerReferralSourcesRepository: Repository<CustomerReferralSources>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly referralSourceService: ReferralSourceService,
  ) { }

  async findCustomersInLocation(
    locationId: number,
    options: {
      page?: number;
      limit?: number;
      showInActive?: boolean;
      showActive?: boolean;
      firstName?: string;
      lastName?: string;
      email?: string;
      student?: string;
      balance?: 'all' | 'credit' | 'owing';
      sort?: 'firstName' | 'lastName';
      order?: 'asc' | 'desc';
    } = {},
  ): Promise<{ customers: any[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      showInActive = false,
      showActive = false,
      firstName,
      lastName,
      email,
      student,
      balance = 'all',
      sort = 'lastName',
      order = 'asc',
    } = options;

    // Optimized query with correct joins and proper filtering
    // Emails are joined directly to avoid separate query
    // Using leftJoin for filtering-only relations to reduce data transfer
    const query = this.userRepository
      .createQueryBuilder('user')
      .distinct(true)
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.students', 'students', 'students.isDeleted = 0')
      .leftJoinAndSelect('user.customerAccount', 'account')
      .leftJoinAndSelect('user.contacts', 'contact', 'contact.isDeleted = 0')
      .leftJoinAndSelect('contact.emails', 'emails', 'emails.isDeleted = 0')
      .leftJoin('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = 0')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('profile.firstname IS NOT NULL')
      .andWhere('profile.lastname IS NOT NULL');


    // Mapped walk-in customers belong in this location's customer directory.
    // Their status still controls visibility: inactive placeholders appear in
    // All/Inactive, without changing their status or other customer selectors.
    // Apply status filtering logic only if showAll is false
    
      // if (showActive && !showInActive) {
      //   // Show only active customers and (u.status = 2 or (u.status = 1 and ca.balance != 0.0000)) -- active
      //   query.andWhere('(user.status = :active OR (user.status = :notActive AND account.balance != 0))', { active: 2, notActive: 1 }); // STATUS_ACTIVE
      // } else if (!showActive && showInActive) {
      //   // Show only inactive customers and not(u.status = 2 or (u.status = 1 and ca.balance != 0)) -- in-active
      //   // query.andWhere('user.status = :notActive', { notActive: 1 }); // 
      //   query.andWhere('NOT (user.status = :active OR (user.status = :notActive AND account.balance != 0))', { active: 2, notActive: 1 }); // STATUS_ACTIVE
      // }

      if (showActive && !showInActive) {
        // Show only active customers and u.status = 2 -- active
        query.andWhere('user.status = :active', { active: 2 }); 
      } else if (!showActive && showInActive) {
        // Show only inactive customers and u.status = 1 -- in-active
        query.andWhere('user.status = :notActive', { notActive: 1 }); 
      }


    //Show only active customers and inactive customers with non-zero balance
    // query.andWhere(
    //   new Brackets((qb) => {
    //     qb.where('user.status = :active', { active: 2 }) // STATUS_ACTIVE
    //       .orWhere(
    //         new Brackets((qb2) => {
    //           qb2
    //             .where('user.status = :notActive', { notActive: 1 })
    //             .andWhere('account.balance != 0');
    //         }),
    //       );
    //     }),
    //   );


    // Apply filters
    const filterCustomers = [
      { condition: firstName?.trim(), query: 'profile.firstname LIKE :firstName', params: { firstName: `%${firstName?.trim()}%` } },
      { condition: lastName?.trim(), query: 'profile.lastname LIKE :lastName', params: { lastName: `%${lastName?.trim()}%` } },
      { 
        condition: student?.trim(), 
        query: `(students.firstName LIKE :student OR students.lastName LIKE :student OR CONCAT(students.firstName, ' ', students.lastName) LIKE :student)`, 
        params: { student: `%${student?.trim()}%` } 
      },
      { condition: email?.trim(), query: 'emails.email LIKE :email', params: { email: `%${email?.trim()}%` } }
    ];

    filterCustomers.forEach(({ condition, query: queryString, params }) => {
      if (condition) {
        query.andWhere(queryString, params);
      }
    });


    // Apply balance filter using switch statement
    switch (balance) {
      case 'owing':
        query.andWhere('account.balance > 0');
        break;
      case 'credit':
        query.andWhere('account.balance < :creditThreshold', {
          creditThreshold: CustomerListRepository.CREDIT_THRESHOLD,
        });
        break;
    }

    // Apply sorting - only firstName and lastName supported
    // Add secondary sort by user.id for consistent pagination
    const sortMapping = {
      firstName: 'profile.firstname',
      lastName: 'profile.lastname',
    };
    
    const sortField = sortMapping[sort] || 'profile.lastname'; // Default to lastname
    query
      .orderBy(sortField, order.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('user.id', 'ASC'); // Secondary sort for consistent results

    // Apply pagination
    const skip = (page - 1) * limit;
    query.skip(skip).take(limit);

    try {
      // Optimize: Execute count and data queries in parallel for better performance
      // Count query is simplified to avoid expensive DISTINCT with multiple joins
      const countQuery = this.userRepository
        .createQueryBuilder('user')
        .leftJoin('user.userLocation', 'userLocation')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .leftJoin('user.profile', 'profile')
        .leftJoin('user.students', 'students', 'students.isDeleted = 0')
        .leftJoin('user.customerAccount', 'account')
        .leftJoin('user.contacts', 'contact', 'contact.isDeleted = 0')
        .leftJoin('contact.emails', 'emails', 'emails.isDeleted = 0')
        .where('authAssignment.item_name = :role', { role: 'customer' })
        .andWhere('user.isDeleted = 0')
        .andWhere('userLocation.locationId = :locationId', { locationId })
        .andWhere('profile.firstname IS NOT NULL')
        .andWhere('profile.lastname IS NOT NULL');

      // Apply same filters to count query
      if (showActive && !showInActive) {
        countQuery.andWhere('user.status = :active', { active: 2 });
      } else if (!showActive && showInActive) {
        countQuery.andWhere('user.status = :notActive', { notActive: 1 });
      }

      // Apply same search filters to count query
      filterCustomers.forEach(({ condition, query: queryString, params }) => {
        if (condition) {
          countQuery.andWhere(queryString, params);
        }
      });

      // Apply same balance filter to count query
      switch (balance) {
        case 'owing':
          countQuery.andWhere('account.balance > 0');
          break;
        case 'credit':
          countQuery.andWhere('account.balance < :creditThreshold', {
            creditThreshold: CustomerListRepository.CREDIT_THRESHOLD,
          });
          break;
      }

      // Execute both queries in parallel for maximum performance
      const [customers, countResult] = await Promise.all([
        query.getMany(),
        countQuery.select('COUNT(DISTINCT user.id)', 'count').getRawOne(),
      ]);

      const total = parseInt(countResult?.count || '0', 10);
      return { customers, total };
    } catch (error) {
      console.error('Error in findCustomersInLocation repository:', error);
      console.error('Query SQL:', query.getSql());
      console.error('Query Parameters:', query.getParameters());
      throw error;
    }
  }

  // Get all emails for multiple customers in a single query
   
   async getAllCustomerEmails(customerIds: number[]): Promise<any[]> {
     // If no customer IDs provided, return empty array
     if (!customerIds || customerIds.length === 0) {
      return [];
     }

     try {
       const emails = await this.userEmailRepository
         .createQueryBuilder('userEmail')
         .leftJoinAndSelect('userEmail.userContact', 'userContact')
         .where('userContact.userId IN (:...customerIds)', { customerIds })
         .andWhere('userEmail.isDeleted = :emailDeleted', { emailDeleted: false })
         .andWhere('userContact.isDeleted = :contactDeleted', { contactDeleted: false })
         .orderBy('userContact.isPrimary', 'DESC') // Primary emails first
         .addOrderBy('userEmail.id', 'ASC')
         .getMany();

       return emails;
     } catch (error) {
       console.error('Error in getAllCustomerEmails', error);
       throw error;
     }
   }

  /**
   * Find a customer by their ID and location ID
   * @param customerId - The ID of the customer to find
   * @param locationId - The ID of the location to find the customer in
   * @returns The customer if found, otherwise null
   */
  async findCustomerById(customerId: number, locationId: number): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoinAndSelect('userLocation.location', 'location')
      .leftJoinAndSelect('user.contacts', 'contact')
      .leftJoinAndSelect('contact.phones', 'phones')
      .leftJoinAndSelect('contact.emails', 'emails')
      .leftJoinAndSelect('user.students', 'students')
      .leftJoin('rbac_auth_assignment', 'raa', 'raa.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('raa.item_name = :role', { role: 'customer' })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: 0 })
      .getOne();
  }

  /**
   * Create a new customer
   * @param locationId - The ID of the location
   * @param createCustomerDto - The customer creation data
   * @returns The created customer
   */
  async createCustomer(
    locationId: number,
    createCustomerDto: CreateCustomerRequestDto,
    currentUserId: number,
  ): Promise<User> {
    // Start a transaction
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId,
    };
    await queryRunner.startTransaction();

    try {
      console.log('Transaction started successfully');
      // Step 1: Create user (matches legacy SQL #5)
      const authKey = crypto.randomBytes(32).toString('base64').slice(0, 32);
      const accessToken = crypto.randomBytes(40).toString('base64').slice(0, 40);

      const savedUser = await queryRunner.manager.save(
        User,
        queryRunner.manager.create(
          User,
          {
            username: null,
            auth_key: authKey,
            access_token: accessToken,
            password_hash: null,
            pin_hash: null,
            oauth_client: null,
            oauth_client_user_id: null,
            status: User.STATUS_NOT_ACTIVE,
            canLogin: true,
            canMerge: false,
            isDeleted: false,
            created_at: Math.floor(Date.now() / 1000),
            updated_at: Math.floor(Date.now() / 1000),
          } as unknown as Partial<User>,
        ),
      );
      console.log('User created with ID:', savedUser.id);

      // Step 2: Create customer account (matches legacy SQL #8)
      const customerAccount = new CustomerAccount();
      customerAccount.customerId = savedUser.id;
      customerAccount.balance = 0;
      customerAccount.createdByUserId = savedUser.id; // Assuming current user is the creator
      customerAccount.updatedByUserId = savedUser.id;

      await queryRunner.manager.save(CustomerAccount, customerAccount);
      console.log('Customer account created');

      // Step 3: Create user profile with locale first (matches legacy SQL #11)
      const userProfile = new UserProfile();
      userProfile.userId = savedUser.id;
      // Note: Legacy creates profile with locale first, then updates with names
      // We'll create with names directly for now
      userProfile.firstname = createCustomerDto.firstname;
      userProfile.lastname = createCustomerDto.lastname;

      await queryRunner.manager.save(UserProfile, userProfile);
      console.log('User profile created');

      // Step 4: Assign customer role (matches legacy SQL #12-13)
      await queryRunner.manager.query(
        'INSERT INTO rbac_auth_assignment (item_name, user_id, created_at) VALUES (?, ?, ?)',
        ['customer', savedUser.id.toString(), Math.floor(Date.now() / 1000)]
      );
      console.log('Customer role assigned');

      // Step 5: Create user location (matches legacy SQL #15)
      const userLocation = new UserLocation();
      userLocation.userId = savedUser.id;
      userLocation.locationId = locationId;

      await queryRunner.manager.save(UserLocation, userLocation);
      console.log('User location created');

      // Step 6: Create customer email notifications (matches legacy SQL #20-23)
      const emailNotificationTypes = await queryRunner.manager.find(NotificationEmailType);
      for (const notificationType of emailNotificationTypes) {
        const customerEmailNotification = new CustomerEmailNotification();
        customerEmailNotification.userId = savedUser.id;
        customerEmailNotification.emailNotificationTypeId = notificationType.id;
        customerEmailNotification.isChecked = 0; // 0 = false, 1 = true (tinyint)

        await queryRunner.manager.save(CustomerEmailNotification, customerEmailNotification);
      }
      console.log('Customer email notifications created');

      // Step 7: Create customer referral source if provided (matches legacy SQL #24)
      if (createCustomerDto.referralSourceId) {
        const customerReferralSource = new CustomerReferralSources();
        customerReferralSource.userId = savedUser.id;
        customerReferralSource.referralSourceId = createCustomerDto.referralSourceId;
        customerReferralSource.description = createCustomerDto.description || '';
        customerReferralSource.createdByUserId = savedUser.id;
        customerReferralSource.updatedByUserId = savedUser.id;

        await queryRunner.manager.save(CustomerReferralSources, customerReferralSource);
        console.log('Customer referral source created');
      }

      // Step 8: Create user contact (matches legacy SQL #25)
      const userContact = new UserContact();
      userContact.userId = savedUser.id;
      userContact.isDeleted = false;
      userContact.isPrimary = true;
      userContact.labelId = UserContact.LABEL_WORK;

      const savedContact = await queryRunner.manager.save(UserContact, userContact);
      console.log('User contact created with ID:', savedContact.id);

      // Step 9: Create user email (matches legacy SQL #27)
      const userEmail = new UserEmail();
      userEmail.userContactId = savedContact.id;
      userEmail.email = createCustomerDto.email;
      userEmail.isDeleted = false;

      await queryRunner.manager.save(UserEmail, userEmail);
      console.log('User email created');

      const phoneNumber = createCustomerDto.phoneNumber?.trim();
      if (phoneNumber) {
        const phoneContact = new UserContact();
        phoneContact.userId = savedUser.id;
        phoneContact.isDeleted = false;
        phoneContact.isPrimary = true;
        phoneContact.labelId = UserContact.LABEL_HOME;

        const savedPhoneContact = await queryRunner.manager.save(UserContact, phoneContact);

        const userPhone = new UserPhone();
        userPhone.userContactId = savedPhoneContact.id;
        userPhone.number = phoneNumber;
        userPhone.extension = 0;
        userPhone.note = '';
        userPhone.isDeleted = false;

        await queryRunner.manager.save(UserPhone, userPhone);
        console.log('User phone created');
      }

      await queryRunner.commitTransaction();
      console.log('Transaction committed successfully');

      // Return the created user with relations (outside transaction)
      const createdUser = await this.findCustomerById(savedUser.id, locationId);
      if (!createdUser) {
        throw new Error('Failed to retrieve created customer');
      }
      return createdUser;
    } catch (error) {
      console.error('Error in createCustomer transaction:', error);
      try {
        await queryRunner.rollbackTransaction();
        console.log('Transaction rolled back successfully');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      throw error;
    } finally {
      try {
        await queryRunner.release();
        console.log('Query runner released successfully');
      } catch (releaseError) {
        console.error('Error releasing query runner:', releaseError);
      }
    }
  }

  /**
   * Check if an email already exists for a customer in the specified location
   * @param email - The email to check
   * @param locationId - The location ID to check within
   * @returns true if email exists, false otherwise
   */
  async checkEmailExists(email: string, locationId: number): Promise<boolean> {
    try {
      const existingEmail = await this.userEmailRepository
        .createQueryBuilder('userEmail')
        .leftJoin('userEmail.userContact', 'userContact')
        .leftJoin('userContact.user', 'user')
        .leftJoin('user.userLocation', 'userLocation')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('userEmail.email = :email', { email })
        .andWhere('userEmail.isDeleted = :emailDeleted', { emailDeleted: false })
        .andWhere('userContact.isDeleted = :contactDeleted', { contactDeleted: false })
        .andWhere('user.isDeleted = :userDeleted', { userDeleted: false })
        .andWhere('userLocation.locationId = :locationId', { locationId })
        .andWhere('authAssignment.item_name = :role', { role: 'customer' })
        .getOne();

      return !!existingEmail;
    } catch (error) {
      console.error('Error checking email existence in customer repository:', error);
      // In case of error, assume email doesn't exist to allow creation
      // This prevents blocking legitimate users due to system errors
      return false;
    }
  }

  /**
   * Get referral sources for a location
   * @returns Array of referral sources
   */
  async getReferralSources(): Promise<any[]> {
    return this.referralSourceService.getReferralSources();
  }

  /**
   * Calculate lessons due amount for a customer
   * Based on legacy getLessonsDue method
   */
  async getLessonsDue(customerId: number, locationId: number): Promise<number> {
    const privateLessonsDue = await this.getPrivateLessonsDue(customerId, locationId);
    const groupLessonsOwingAmount = await this.getGroupLessonOwingAmount(customerId, locationId);
    return privateLessonsDue + groupLessonsOwingAmount;
  }

  /**
   * Get detailed lessons due information for a customer (read-only; no insert/update/delete).
   * Returns individual private and group lessons that contribute to the owing amount,
   * including lesson id, lesson date and owing amount.
   */
  async getLessonsDueDetails(
    customerId: number,
    locationId: number,
  ): Promise<{
    privateLessons: { lessonId: number; lessonDate: Date; owingAmount: number; isDeleted: boolean }[];
    groupLessons: { lessonId: number; lessonDate: Date; owingAmount: number; isDeleted: boolean }[];
  }> {
    const nowIso = new Date().toISOString();

    // Reuse the same conditions as getPrivateLessonsDue, but return individual rows
    const invoicedLessonSubQuery = this.lessonRepository
      .createQueryBuilder('ilesson')
      .leftJoin('ilesson.course', 'icourse')
      .leftJoin('icourse.program', 'iprogram')
      .leftJoin('icourse.enrolments', 'ienrolment')
      .leftJoin('ienrolment.student', 'istudent')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .where('ilesson.isDeleted = false')
      .andWhere('ilesson.isConfirmed = true')
      .andWhere('ilesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('icourse.isDeleted = false')
      .andWhere('iprogram.type = :privateProgram', { privateProgram: 1 })
      .andWhere('ienrolment.isDeleted = false')
      .andWhere('ienrolment.isConfirmed = true')
      .andWhere('istudent.customerId = :customerId', { customerId })
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iinv.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .select('ilesson.*');

    const privateLessonsRaw = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course')
      .leftJoin('course.program', 'program')
      .leftJoin('lesson.privateLesson', 'privateLesson')
      .leftJoin('course.enrolments', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(`(${invoicedLessonSubQuery.getQuery()})`, 'invoiced_lesson', 'lesson.id = invoiced_lesson.id')
      .setParameters(invoicedLessonSubQuery.getParameters())
      .where('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('lesson.dueDate < :nowIso', { nowIso })
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = :privateProgram', { privateProgram: 1 })
      .andWhere('privateLesson.balance > 0.09')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select([
        'lesson.id AS lessonId',
        'lesson.date AS lessonDate',
        'privateLesson.balance AS owingAmount',
        'lesson.isDeleted AS isDeleted',
      ])
      .getRawMany();

    // Deduplicate by lesson id (join on course.enrolments can duplicate when multiple enrolments match same customer)
    const privateSeen = new Set<number>();
    const privateLessonsRawUnique = privateLessonsRaw.filter((row: any) => {
      const id = Number(row.lessonId);
      if (privateSeen.has(id)) return false;
      privateSeen.add(id);
      return true;
    });

    // Reuse the same conditions as getGroupLessonOwingAmount, but return individual rows
    const invoicedGroupLessonSubQuery = this.groupLessonRepository
      .createQueryBuilder('igl')
      .leftJoin('igl.lesson', 'ilesson')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .leftJoin('igl.enrolment', 'ienrol')
      .leftJoin('ienrol.invoiceItemEnrolment', 'iie')
      .leftJoin('iie.invoiceLineItem', 'iieli')
      .leftJoin('iieli.invoice', 'iienv')
      .where('iill.id IS NOT NULL')
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iieli.isDeleted = false')
      .andWhere('iienv.isDeleted = false')
      .select('igl.*');

    const groupLessonsRaw = await this.groupLessonRepository
      .createQueryBuilder('groupLesson')
      .leftJoin('groupLesson.lesson', 'lesson')
      .leftJoin('groupLesson.enrolment', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(`(${invoicedGroupLessonSubQuery.getQuery()})`, 'invoiced_lesson', 'groupLesson.id = invoiced_lesson.id')
      .setParameters(invoicedGroupLessonSubQuery.getParameters())
      .where('groupLesson.isDeleted = false')
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('groupLesson.balance > 0.09')
      .andWhere('groupLesson.dueDate < :nowIso', { nowIso })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select([
        'groupLesson.id AS lessonId',
        'lesson.date AS lessonDate',
        'groupLesson.balance AS owingAmount',
        'groupLesson.isDeleted AS isDeleted',
      ])
      .getRawMany();

    // Deduplicate group lessons by lessonId (group_lesson.id)
    const groupSeen = new Set<number>();
    const groupLessonsRawUnique = groupLessonsRaw.filter((row: any) => {
      const id = Number(row.lessonId);
      if (groupSeen.has(id)) return false;
      groupSeen.add(id);
      return true;
    });

    const privateLessons = privateLessonsRawUnique.map((row: any) => ({
      lessonId: Number(row.lessonId),
      lessonDate: row.lessonDate,
      owingAmount: parseFloat(row.owingAmount ?? '0'),
      isDeleted: Boolean(Number(row.isDeleted)),
    }));

    const groupLessons = groupLessonsRawUnique.map((row: any) => ({
      lessonId: Number(row.lessonId),
      lessonDate: row.lessonDate,
      owingAmount: parseFloat(row.owingAmount ?? '0'),
      isDeleted: Boolean(Number(row.isDeleted)),
    }));

    return { privateLessons, groupLessons };
  }

  /**
   * Calculate private lessons due amount
   * Based on legacy getPrivateLessonsDue method - matches provided SQL exactly
   */
  async getPrivateLessonsDue(customerId: number, locationId: number): Promise<number> {
    const nowIso = new Date().toISOString();

    // Build subquery for invoiced lessons (matches the complex SQL subquery exactly)
    const invoicedLessonSubQuery = this.lessonRepository
      .createQueryBuilder('ilesson')
      .leftJoin('ilesson.course', 'icourse')
      .leftJoin('icourse.program', 'iprogram')
      .leftJoin('icourse.enrolments', 'ienrolment')
      .leftJoin('ienrolment.student', 'istudent')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .where('ilesson.isDeleted = false')
      .andWhere('ilesson.isConfirmed = true')
      .andWhere('ilesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('icourse.isDeleted = false')
      .andWhere('iprogram.type = :privateProgram', { privateProgram: 1 })
      .andWhere('ienrolment.isDeleted = false')
      .andWhere('ienrolment.isConfirmed = true')
      .andWhere('istudent.customerId = :customerId', { customerId })
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iinv.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .select('ilesson.*');

    // Main query: one row per lesson so each balance is counted once (join on course.enrolments
    // duplicates rows per enrolment; GROUP BY lesson.id fixes that).
    const lessonBalancesRows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course')
      .leftJoin('course.program', 'program')
      .leftJoin('lesson.privateLesson', 'privateLesson')
      .leftJoin('course.enrolments', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(`(${invoicedLessonSubQuery.getQuery()})`, 'invoiced_lesson', 'lesson.id = invoiced_lesson.id')
      .setParameters(invoicedLessonSubQuery.getParameters())
      .where('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('lesson.dueDate < :nowIso', { nowIso })
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = :privateProgram', { privateProgram: 1 })
      .andWhere('privateLesson.balance > 0.09')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select('lesson.id', 'lessonId')
      .addSelect('MAX(privateLesson.balance)', 'balance')
      .groupBy('lesson.id')
      .getRawMany();

    const total = lessonBalancesRows.reduce((sum, row) => sum + parseFloat(row.balance ?? '0'), 0);
    return total;
  }

  /**
   * Calculate group lesson owing amount
   * Based on legacy getGroupLessonOwingAmount method - matches provided SQL exactly
   */
  async getGroupLessonOwingAmount(customerId: number, locationId: number): Promise<number> {
    const nowIso = new Date().toISOString();

    // Build subquery for invoiced group lessons (matches the complex SQL subquery exactly)
    const invoicedGroupLessonSubQuery = this.groupLessonRepository
      .createQueryBuilder('igl')
      .leftJoin('igl.lesson', 'ilesson')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .leftJoin('igl.enrolment', 'ienrol')
      .leftJoin('ienrol.invoiceItemEnrolment', 'iie')
      .leftJoin('iie.invoiceLineItem', 'iieli')
      .leftJoin('iieli.invoice', 'iienv')
      .where('iill.id IS NOT NULL')
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iieli.isDeleted = false')
      .andWhere('iienv.isDeleted = false')
      .select('igl.*');

    // Main query for group lessons due (matches provided SQL exactly)
    const groupLessonsOwingAmount = await this.groupLessonRepository
      .createQueryBuilder('groupLesson')
      .leftJoin('groupLesson.lesson', 'lesson')
      .leftJoin('groupLesson.enrolment', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(`(${invoicedGroupLessonSubQuery.getQuery()})`, 'invoiced_lesson', 'groupLesson.id = invoiced_lesson.id')
      .setParameters(invoicedGroupLessonSubQuery.getParameters())
      .where('groupLesson.isDeleted = false')
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('groupLesson.balance > 0.09')
      .andWhere('groupLesson.dueDate < :nowIso', { nowIso })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select('SUM(groupLesson.balance)', 'total')
      .getRawOne();

    return parseFloat(groupLessonsOwingAmount?.total || '0');
  }

  /**
   * Calculate outstanding invoice amount total
   * Based on legacy getInvoiceOwingAmountTotal method
   *
   * Canceled and void invoices are excluded: they are hidden from every invoice
   * list, so counting their leftover balance here surfaces an amount owing that
   * the customer has no way to see or pay.
   */
  async getInvoiceOwingAmountTotal(customerId: number, locationId: number): Promise<number> {
    const invoiceOwingAmount = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.balance > 0.09')
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
      .select('SUM(invoice.balance)', 'total')
      .getRawOne();

    return parseFloat(invoiceOwingAmount?.total || '0');
  }

  /**
   * Calculate total credits
   * Based on legacy getTotalCredits method
   *
   * Deliberately does NOT exclude canceled/void invoices, unlike
   * getInvoiceOwingAmountTotal. Voiding zeroes an invoice's total but leaves any
   * payment applied, so balance becomes -(amount paid): a real credit the
   * customer is owed. Filtering those out here would erase money they actually paid.
   */
  async getTotalCredits(customerId: number, locationId: number): Promise<number> {
    // Get invoice credits (not deleted) - invoices with negative balance (credit invoices)
    const invoiceCredits = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('ROUND(invoice.balance, 2) < -0.1') // Credit invoices have negative balance
      .select('SUM(ABS(invoice.balance))', 'total')
      .getRawOne();

    // Get invoice credits (deleted) - deleted invoices with negative balance
    const rentalInvoiceCredits = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = true')
      .andWhere('ROUND(invoice.balance, 2) < -0.1') // Credit invoices have negative balance
      .select('SUM(ABS(invoice.balance))', 'total')
      .getRawOne();

    // Get payment credits (not deleted, not auto payments) - payments with positive balance
    const paymentCredits = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :customerId', { customerId })
      .andWhere('payment.isDeleted = false')
      .andWhere('payment.balance > 0.09') // Credit payments have positive balance
      .andWhere('payment.paymentMethodId NOT IN (:...autoPaymentMethods)', {
        autoPaymentMethods: [PaymentMethod.TYPE_CREDIT_USED, PaymentMethod.TYPE_CREDIT_APPLIED],
      })
      .select('SUM(ABS(payment.balance))', 'total')
      .getRawOne();

    const invoiceCreditsTotal = parseFloat(invoiceCredits?.total || '0');
    const rentalInvoiceCreditsTotal = parseFloat(rentalInvoiceCredits?.total || '0');
    const paymentCreditsTotal = parseFloat(paymentCredits?.total || '0');

    return invoiceCreditsTotal + rentalInvoiceCreditsTotal + paymentCreditsTotal;
  }

  /**
   * Check if customer has active students
   * @param customerId - The ID of the customer
   * @returns True if customer has active students
   */
  async hasActiveStudents(customerId: number): Promise<boolean> {
    const activeStudentsCount = await this.studentRepository
      .createQueryBuilder('student')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('student.status = :status', { status: 1 }) // 1 = Active
      .getCount();
    
    return activeStudentsCount > 0;
  }

  /**
   * Check if customer has any students (active or inactive)
   * @param customerId - The ID of the customer
   * @returns True if customer has any students
   */
  async hasStudents(customerId: number): Promise<boolean> {
    const studentsCount = await this.studentRepository
      .createQueryBuilder('student')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :isDeleted', { isDeleted: 0 })
      .getCount();
    
    return studentsCount > 0;
  }

  /**
   * Check if customer has payments
   * @param customerId - The ID of the customer
   * @returns True if customer has payments
   */
  async hasPayments(customerId: number): Promise<boolean> {
    const paymentsCount = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.userId = :customerId', { customerId })
      .andWhere('payment.isDeleted = :isDeleted', { isDeleted: false })
      .getCount();
    
    return paymentsCount > 0;
  }

  /**
   * Delete a customer (soft delete by setting isDeleted = true)
   * @param customerId - The ID of the customer to delete
   * @param locationId - The ID of the location
   * @returns The deleted customer
   * @throws Error if customer has active students or payments (only for active customers)
   */
  async deleteCustomer(customerId: number, locationId: number): Promise<User> {
    // Verify customer exists and belongs to the location
    const customer = await this.findCustomerById(customerId, locationId);
    
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found in location`);
    }

    // If customer status is inactive, allow deletion without validation checks
    if (customer.status === User.STATUS_NOT_ACTIVE) {
      // Soft delete the customer
      customer.isDeleted = true;
      customer.updated_at = Math.floor(Date.now() / 1000);
      
      return await this.userRepository.save(customer);
    }

    // Validation checks before deletion (only for active customers)
    // Check if customer has any students (active or inactive)
    const hasStudents = await this.hasStudents(customerId);
    if (hasStudents) {
      throw new Error('Unable to delete. There are student(s) associated with this customer');
    }

    // Check if customer has payments
    const hasPayments = await this.hasPayments(customerId);
    if (hasPayments) {
      throw new Error('Unable to delete. There are payments associated with this customer');
    }

    // Soft delete the customer
    customer.isDeleted = true;
    customer.updated_at = Math.floor(Date.now() / 1000);
    
    return await this.userRepository.save(customer);
  }

  /**
   * Get notification email types with checked status for a customer
   * @param customerId - The ID of the customer
   * @returns Array of notification types with checked status
   */
  async getNotificationEmailTypes(customerId: number): Promise<any[]> {
    // Get all notification email types
    const emailTypes = await this.notificationEmailTypeRepository
      .createQueryBuilder('net')
      .where('net.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('net.id', 'ASC')
      .getMany();

    // Get checked notification types for this customer
    const checkedNotifications = await this.customerEmailNotificationRepository
      .createQueryBuilder('cen')
      .where('cen.userId = :customerId', { customerId })
      .andWhere('cen.isChecked = :isChecked', { isChecked: true })
      .getMany();

    // Create a map of checked notification type IDs
    const checkedTypeIds = new Set(
      checkedNotifications.map(n => n.emailNotificationTypeId)
    );

    // Map email types with checked status
    return emailTypes.map(type => ({
      id: type.id,
      emailNotifyType: type.emailNotifyType,
      isChecked: checkedTypeIds.has(type.id),
    }));
  }

  /**
   * Update notification email settings for a customer
   * @param customerId - The ID of the customer
   * @param emailNotifyTypeIds - Array of notification type IDs to enable
   * @returns Success status
   */
  async updateNotificationEmailSettings(
    customerId: number,
    emailNotifyTypeIds: number[],
  ): Promise<void> {
    const runner = this.userRepository.manager.connection.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      // Preferences are customer-wide. Serialize saves for this customer so
      // concurrent opt-in/out requests cannot leave partially updated settings.
      await runner.query('SELECT id FROM user WHERE id = ? FOR UPDATE', [customerId]);
      const types = await runner.manager.getRepository(NotificationEmailType).find({
        where: { isDeleted: 0 },
      });
      const notifications = runner.manager.getRepository(CustomerEmailNotification);
      const selected = new Set(emailNotifyTypeIds);
      for (const type of types) {
        const existing = await notifications.findOneBy({
          userId: customerId, emailNotificationTypeId: type.id,
        });
        await notifications.save(notifications.create({
          ...existing,
          userId: customerId,
          emailNotificationTypeId: type.id,
          isChecked: selected.has(type.id) ? 1 : 0,
        }));
      }
      if (types.some(type => [1, 2, 3, 4].includes(type.id) && selected.has(type.id))) {
        // Also repair on an enabled re-save, not only the first transition.
        // All this customer's locations share these preferences.
        await new FutureLessonNotificationRepair(customerId).repair(runner);
      }
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

}
