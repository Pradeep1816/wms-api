import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomerListRequestDto, CreateCustomerRequestDto } from '../dto/customer-request.dto';
import { CustomerResponseDto, CustomerListItemDto, CustomerListFooterDto, CustomerListDataDto } from '../dto/customer-response.dto';
import { CustomerListRepository } from '../repositories/customers.repository';
import { LocationService } from '../../location/services/location.service';
import { getSafeBalance } from '../../utils/helper';
import { formatCurrency } from '../../utils/formatters';
import { plainToInstance } from 'class-transformer';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { CacheService } from '../../cache/cache.service';
import { PrivateLessonDueService } from '../../lesson/services/private-lesson-due.service';
import { GroupLessonDueService } from '../../lesson/services/group-lesson-due.service';
import { OutstandingInvoiceService } from '../../invoice/services/outstanding-invoice.service';
import { AvailableCreditsService } from '../../invoice/services/available-credits.service';
import { EmailStatementResponseDto } from '../dto/email-statement-response.dto';
import { PrivateLessonDueRequestDto } from '../../lesson/dto/private-lesson-due-request.dto';
import { GroupLessonDueRequestDto } from '../../lesson/dto/group-lesson-due-request.dto';
import { OutstandingInvoiceRequestDto } from '../../invoice/dto/outstanding-invoice-request.dto';
import { AvailableCreditsRequestDto } from '../../invoice/dto/available-credits-request.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { EmailTemplate } from '../../notification/entities/email-template.entity';
import { EmailSendObjectTypeEnum } from '../../notification/enums/send-email-object-type.enum';
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class CustomerService {
  private readonly customerListCacheTtlSeconds = 1800; // 30 minutes

  constructor(
    private readonly customerRepository: CustomerListRepository,
    private readonly locationService: LocationService,
    private readonly validationService: CustomerValidationService,
    private readonly privateLessonDueService: PrivateLessonDueService,
    private readonly groupLessonDueService: GroupLessonDueService,
    private readonly outstandingInvoiceService: OutstandingInvoiceService,
    private readonly availableCreditsService: AvailableCreditsService,
    private readonly cacheService: CacheService,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
  ) {}

  async getCustomers(locationSlug: string, query: CustomerListRequestDto): Promise<CustomerListDataDto> {
    try {
      // Check if this is the default query that should be cached
      const isDefaultQuery = this.isDefaultCustomerListQuery(query);
      
      if (isDefaultQuery) {
        // Use cache for default query (first 20 active customers)
        const cacheKey = this.getCustomerListCacheKey(locationSlug);
        
        return await this.cacheService.remember<CustomerListDataDto>(
          cacheKey,
          async () => {
            return await this.fetchCustomers(locationSlug, query);
          },
          this.customerListCacheTtlSeconds,
        );
      }

      // For non-default queries, fetch directly without cache
      return await this.fetchCustomers(locationSlug, query);
    } catch (error) {
      console.error('Error in getCustomers service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve customers: ${error.message}`);
    }
  }

  /**
   * Check if the query matches the default customer list query
   * Default: page=1, limit=20, showActive=true, showInActive=false, order=asc, no filters
   */
  private isDefaultCustomerListQuery(query: CustomerListRequestDto): boolean {
    return (
      (query.page === undefined || query.page === 1) &&
      (query.limit === undefined || query.limit === 20) &&
      query.showActive === true &&
      query.showInActive === false &&
      (query.order === undefined || query.order === 'asc') &&
      !query.firstName &&
      !query.lastName &&
      !query.email &&
      !query.student &&
      (query.balance === undefined || query.balance === 'all') &&
      (query.sort === undefined || query.sort === 'lastName')
    );
  }

  /**
   * Generate cache key for customer list
   */
  private getCustomerListCacheKey(locationSlug: string): string {
    return `customer:list:${locationSlug}:default`;
  }

  /**
   * Invalidate customer list cache for a specific location
   * Call this method when customers are created, updated, or deleted
   */
  async invalidateCustomerListCache(locationSlug: string): Promise<void> {
    const cacheKey = this.getCustomerListCacheKey(locationSlug);
    await this.cacheService.forget(cacheKey);
  }

  /**
   * Fetch customers from database (actual implementation)
   */
  private async fetchCustomers(locationSlug: string, query: CustomerListRequestDto): Promise<CustomerListDataDto> {
    // Get location ID from slug
    const locationId = await this.locationService.getLocationId(locationSlug);

    // Transform query parameters to match repository expectations
    const repositoryOptions = {
      page: query.page,
      limit: query.limit,
      showActive: query.showActive,
      showInActive: query.showInActive,
      firstName: query.firstName,
      lastName: query.lastName,
      email: query.email,
      student: query.student,
      balance: query.balance,
      sort: query.sort,
      order: query.order,
    };

    const { customers, total } = await this.customerRepository.findCustomersInLocation(
      locationId,
      repositoryOptions,
    );

    // Early return optimization - avoid processing if no customers
    if (customers.length === 0) {
      return {
        body: [],
        footer: this.getEmptyFooter(),
        pagination: {
          page: query.page || 1,
          limit: query.limit || 20,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Emails are already joined in the main query, no separate query needed
    // Transform customers to list item DTOs
    const body = customers.map(customer => this.transformToListItem(customer));

    // Calculate footer totals (page-wise and main total)
    const footer = this.calculateFooterTotals(customers);

    const totalPages = Math.ceil(total / (query.limit || 20));
    
    return {
      body,
      footer,
      pagination: {
        page: query.page || 1,
        limit: query.limit || 20,
        total,
        totalPages,
      },
    };
  }

   //Transform customer entity to list item DTO
   // Emails are now loaded directly from the joined contacts relation

   private transformToListItem(customer: any): CustomerListItemDto {
     // Get emails from joined contacts relation - optimized for performance
     let primaryEmail = '';
     let customerEmails = '';
     
     if (customer.contacts && customer.contacts.length > 0) {
       // Optimized: Collect emails with primary flag, separate primary and non-primary
       const primaryEmails: string[] = [];
       const nonPrimaryEmails: string[] = [];
       
       for (const contact of customer.contacts) {
         if (contact.emails && contact.emails.length > 0) {
           const isPrimary = contact.isPrimary || false;
           for (const email of contact.emails) {
             if (email.email) {
               if (isPrimary) {
                 primaryEmails.push(email.email);
               } else {
                 nonPrimaryEmails.push(email.email);
               }
             }
           }
         }
       }

       // Sort each group separately for better performance
       primaryEmails.sort();
       nonPrimaryEmails.sort();
       
       // Combine: primary first, then non-primary
       const allEmails = [...primaryEmails, ...nonPrimaryEmails];
       customerEmails = allEmails.join(', ');
       primaryEmail = allEmails.length > 0 ? allEmails[0] : '';
     }

    // Optimized: Use reduce for better performance with large student lists
    const studentNames = customer.students?.length > 0
      ? customer.students
          .map((student: any) => `${student.firstName || ''} ${student.lastName || ''}`.trim())
          .filter((name: string) => name.length > 0)
          .join(', ')
      : '';
    
    // Handle balance - get from customerAccount relation
    const balance = customer.customerAccount?.balance;
    
    // Handle null, undefined, or NaN values
    const safeBalance = getSafeBalance(balance);
    // let isActive = customer.status === 2 || (customer.status === 1 && customer.customerAccount?.balance != 0);
    let isActive = customer.status === 2;

    return {
      id: customer.id,
      isActive: isActive,
      firstName: customer.profile?.firstname || '',
      lastName: customer.profile?.lastname || '',
      email: primaryEmail,
      allEmails: customerEmails,
      students: studentNames,
      balance: formatCurrency(safeBalance),
    };
  }

 /**
  * Get a customer by their ID and location slug
  * @param customerId - The ID of the customer to retrieve
  * @param locationSlug - The slug of the location to retrieve the customer from
  * @returns The customer response DTO
  */

  async getCustomerById(customerId: number, locationSlug: string): Promise<any> {
    try {
      const {locationId}=await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      const customer = await this.customerRepository.findCustomerById(customerId, locationId);

      const fullName = customer?.profile
          ? `${customer?.profile.firstname || ''} ${customer?.profile.lastname || ''}`.trim()
          : '';
      
      return {
        body: {
          id: customer?.id,
          fullName: fullName,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve customer details');
    }
  }

  /**
   * Create a new customer
   * @param locationSlug - The slug of the location
   * @param createCustomerDto - The customer creation data
   * @returns The created customer response DTO
   */
  async createCustomer(
    locationSlug: string,
    createCustomerDto: CreateCustomerRequestDto,
    currentUserId: number,
  ): Promise<CustomerResponseDto> {
    try {
      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(locationSlug);

      // Check if email already exists before creating customer
      const emailExists = await this.customerRepository.checkEmailExists(createCustomerDto.email, locationId);
      if (emailExists) {
        throw new BadRequestException('Email already exists for a customer in this location');
      }

      // Create customer using repository
      const customer = await this.customerRepository.createCustomer(
        locationId,
        createCustomerDto,
        currentUserId,
      );
      
      if (!customer) {
        throw new BadRequestException('Failed to create customer');
      }

      // Transform customer to response DTO
      const customerDto = plainToInstance(CustomerResponseDto, customer, { excludeExtraneousValues: true });

      return customerDto;
    } catch (error) {
      console.error('Error in createCustomer service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create customer: ${error.message}`);
    }
  }


 

  private getEmptyFooter(): CustomerListFooterDto {
    return {
      id: '',
      isActive: '',
      firstName: '',
      lastName: '',
      email: '',
      students: '',
      balance: formatCurrency(0),
    };
  }

  private calculateFooterTotals(customers: any[]): CustomerListFooterDto {
    const totalBalance = customers.reduce((sum, customer) => {
      const balance = customer.customerAccount?.balance;
      return sum + getSafeBalance(balance);
    }, 0);

    return {
      id: '',
      isActive: '',
      firstName: '',
      lastName: '',
      email: '',
      students: '',
      balance: formatCurrency(totalBalance),
    };
  }

  /**
   * Get customer summary (read-only: only reads from DB; no insert/update/delete).
   */
  async getCustomerSummary(locationSlug: string, customerId: number): Promise<any> {
    try {
      const locationId = await this.locationService.getLocationId(locationSlug);
      const customer = await this.customerRepository.findCustomerById(customerId, locationId);
      if (!customer) {
        throw new NotFoundException(`Customer with ID ${customerId} not found in location ${locationSlug}`);
      }

      // Calculate the four financial metrics using repository methods in parallel for better performance
      const [lessonsDue, outstandingInvoice, totalCredits] = await Promise.all([
        this.customerRepository.getLessonsDue(customerId, locationId),
        this.customerRepository.getInvoiceOwingAmountTotal(customerId, locationId),
        this.customerRepository.getTotalCredits(customerId, locationId),
        // this.customerRepository.getLessonsDueDetails(customerId, locationId),
      ]);
      const balance = lessonsDue + outstandingInvoice - totalCredits;

      return {
        lessonsDue: formatCurrency(lessonsDue),
        outstandingInvoice: formatCurrency(outstandingInvoice),
        totalCredits: formatCurrency(totalCredits),
        balance: formatCurrency(balance),
        // privateLessonsDueDetails: lessonsDueDetails.privateLessons.map(lesson => ({
        //   lessonId: lesson.lessonId,
        //   lessonDate: lesson.lessonDate,
        //   owingAmount: formatCurrency(Math.round(lesson.owingAmount * 100) / 100),
        //   isDeleted: lesson.isDeleted,
        // })),
        // groupLessonsDueDetails: lessonsDueDetails.groupLessons.map(lesson => ({
        //   lessonId: lesson.lessonId,
        //   lessonDate: lesson.lessonDate,
        //   owingAmount: formatCurrency(Math.round(lesson.owingAmount * 100) / 100),
        //   isDeleted: lesson.isDeleted,
        // })),
      };
    } catch (error) {
      console.error('Error in getCustomerSummary service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve customer summary');
    }
  }

  /**
   * Delete a customer (soft delete)
   * @param locationSlug - The slug of the location
   * @param customerId - The ID of the customer to delete
   * @returns Success message
   */
  async deleteCustomer(locationSlug: string, customerId: number): Promise<any> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Delete the customer
      await this.customerRepository.deleteCustomer(customerId, locationId);

      return { success: true };
    } catch (error) {
      console.error('Error in deleteCustomer service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete customer: ${error.message}`);
    }
  }

  /**
   * Get notification email types with checked status for a customer
   * @param locationSlug - The slug of the location
   * @param customerId - The ID of the customer
   * @returns Array of notification types with checked status
   */
  async getNotificationEmailTypes(locationSlug: string, customerId: number): Promise<any> {
    try {
      // Validate location and customer
      await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get notification email types
      const emailTypes = await this.customerRepository.getNotificationEmailTypes(customerId);

      return {
        emailTypes,
      };
    } catch (error) {
      console.error('Error in getNotificationEmailTypes service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve notification email types: ${error.message}`);
    }
  }

  /**
   * Update notification email settings for a customer
   * @param locationSlug - The slug of the location
   * @param customerId - The ID of the customer
   * @param emailNotifyTypeIds - Array of notification type IDs to enable
   * @returns Success message
   */
  async updateNotificationEmailSettings(
    locationSlug: string,
    customerId: number,
    emailNotifyTypeIds: number[],
  ): Promise<any> {
    try {
      // Validate location and customer
      await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Update notification email settings
      await this.customerRepository.updateNotificationEmailSettings(customerId, emailNotifyTypeIds);

      return { success: true };
    } catch (error) {
      console.error('Error in updateNotificationEmailSettings service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update notification email settings: ${error.message}`);
    }
  }

  /**
   * Get customer statement data for email
   * @param locationSlug - The slug of the location
   * @param customerId - The ID of the customer
   * @returns Email statement data
   */
  async getEmailStatementData(locationSlug: string, customerId: number): Promise<EmailStatementResponseDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get customer with emails
      const customer = await this.customerRepository.findCustomerById(customerId, locationId);
      if (!customer) {
        throw new NotFoundException(`Customer with ID ${customerId} not found in location ${locationSlug}`);
      }

      // Get customer emails
      const customerEmails = await this.customerRepository.getAllCustomerEmails([customerId]);
      const emailList = customerEmails.map(email => email.email).filter(email => email && email.trim() !== '');

      // Get current month date range (first day to last day of current month)
      const currentDate = new Date();
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const fromDate = firstDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const toDate = lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      // Fetch all data in parallel
      const [privateLessonsResult, groupLessonsResult, invoicesResult, creditsResult] = await Promise.all([
        this.privateLessonDueService.getPrivateLessonDuesByCustomerId(
          locationSlug,
          customerId,
          { fromDate, toDate, page: 1, limit: 1000 } as PrivateLessonDueRequestDto,
        ),
        this.groupLessonDueService.getGroupLessonDuesByCustomerId(
          locationSlug,
          customerId,
          { fromDate, toDate, page: 1, limit: 1000 } as GroupLessonDueRequestDto,
        ),
        this.outstandingInvoiceService.getOutstandingInvoicesByCustomerId(
          locationSlug,
          customerId,
          { page: 1, limit: 1000 } as OutstandingInvoiceRequestDto,
        ),
        this.availableCreditsService.getAvailableCredits(
          locationSlug,
          customerId,
          { page: 1, limit: 1000 } as AvailableCreditsRequestDto,
        ),
      ]);

      const formatDate = (value: Date | string | null | undefined): string => {
        if (!value) {
          return '';
        }
        const dateObj = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(dateObj.getTime())) {
          return '';
        }
        return dateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        });
      };

      // Format date with time for lessons (format: "Nov 12, 2025 @ 10:15 AM")
      // Database stores times in EST/EDT, TypeORM may interpret as UTC
      // We need to extract the UTC components and format them as local time
      const formatDateWithTime = (value: Date | string | null | undefined): string => {
        if (!value) {
          return '';
        }
        const dateObj = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(dateObj.getTime())) {
          return '';
        }
        // Get UTC components (which represent the stored EST/EDT time)
        const year = dateObj.getUTCFullYear();
        const month = dateObj.getUTCMonth();
        const day = dateObj.getUTCDate();
        const hours = dateObj.getUTCHours();
        const minutes = dateObj.getUTCMinutes();
        
        // Format date
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dateStr = `${months[month]} ${day}, ${year}`;
        
        // Format time in 12-hour format
        const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const minutesStr = minutes.toString().padStart(2, '0');
        const timeStr = `${hour12}:${minutesStr} ${ampm}`;
        
        return `${dateStr} @ ${timeStr}`;
      };

      // Transform private lessons with time
      const privateLessonsDue = privateLessonsResult.body || [];
      // Get lesson IDs to fetch raw dates with time
      const privateLessonIds = privateLessonsDue.map((lesson: any) => lesson.id).filter((id: any) => id && !isNaN(Number(id)));
      const privateLessonsRaw = privateLessonIds.length > 0
        ? await this.lessonRepository.find({
            where: { id: In(privateLessonIds) },
            select: ['id', 'date'],
          })
        : [];
      const privateLessonsDateMap = new Map(
        privateLessonsRaw.map((lesson: any) => [lesson.id, lesson.date])
      );
      
      const privateLessons = privateLessonsDue.map((lesson: any) => {
        // Get raw date with time from repository
        const rawDate = privateLessonsDateMap.get(lesson.id);
        const lessonDateStr = rawDate ? formatDateWithTime(rawDate) : formatDate(lesson.lessonDate);
        
        return {
          lessonDate: lessonDateStr,
          studentName: lesson.studentName,
          programName: lesson.programName,
          teacherName: lesson.teacherName,
          amount: parseFloat(lesson.amount.replace(/[^0-9.-]/g, '')) || 0,
        };
      });

      // Transform group lessons with time
      const groupLessonsDue = groupLessonsResult.body || [];
      // Get group lesson IDs to fetch lesson relationships
      const groupLessonIds = groupLessonsDue.map((lesson: any) => lesson.id).filter((id: any) => id && !isNaN(Number(id)));
      
      // Fetch group lessons with lesson relationship to get lesson IDs
      const groupLessonsWithLesson = groupLessonIds.length > 0
        ? await this.groupLessonRepository.find({
            where: { id: In(groupLessonIds) },
            relations: ['lesson'],
            select: ['id', 'lesson'],
          })
        : [];
      
      // Create a map of group lesson ID to lesson ID
      const groupLessonToLessonIdMap = new Map(
        groupLessonsWithLesson
          .filter((gl: any) => gl.lesson && gl.lesson.id)
          .map((gl: any) => [gl.id, gl.lesson.id])
      );
      
      // Get unique lesson IDs
      const lessonIds = Array.from(new Set(groupLessonToLessonIdMap.values())).filter((id: any) => id && !isNaN(Number(id)));
      
      // Fetch lesson dates
      const lessonsRaw = lessonIds.length > 0
        ? await this.lessonRepository.find({
            where: { id: In(lessonIds) },
            select: ['id', 'date'],
          })
        : [];
      const lessonsDateMap = new Map(
        lessonsRaw.map((lesson: any) => [lesson.id, lesson.date])
      );
      
      const groupLessons = groupLessonsDue.map((lesson: any) => {
        // Get lesson ID from group lesson
        const lessonId = groupLessonToLessonIdMap.get(lesson.id);
        const rawDate = lessonId ? lessonsDateMap.get(lessonId) : null;
        let lessonDateStr = '';
        
        if (rawDate) {
          lessonDateStr = formatDateWithTime(rawDate);
        } else {
          // Fallback: try to parse the lessonDate string and format with time
          const parsedDate = new Date(lesson.lessonDate);
          if (!Number.isNaN(parsedDate.getTime())) {
            lessonDateStr = formatDateWithTime(parsedDate);
          } else {
            lessonDateStr = formatDate(lesson.lessonDate);
          }
        }
        
        return {
          lessonDate: lessonDateStr,
          studentName: lesson.studentName,
          programName: lesson.programName,
          teacherName: lesson.teacherName,
          amount: parseFloat(lesson.amount.replace(/[^0-9.-]/g, '')) || 0,
        };
      });

      // Transform invoices
      const invoices = invoicesResult.body || [];
      const invoiceList = invoices.map(invoice => ({
        id: invoice.id,
        date: formatDate(invoice.date),
        status: 'Outstanding',
        total: parseFloat(invoice.amount?.toString().replace(/[^0-9.-]/g, '') || '0'),
        balance: parseFloat(invoice.balanceDue?.toString().replace(/[^0-9.-]/g, '') || '0'),
      }));

      // Transform credits - need to get raw data from repository to get type and reference
      const credits = creditsResult.body || [];
      const creditList = credits.map((credit: any) => ({
        id: credit.id,
        type: credit.type || 'Credit',
        reference: credit.reference || '',
        amount: parseFloat(credit.amount?.toString().replace(/[^0-9.-]/g, '') || '0'),
      }));

      // Calculate totals
      const privateLessonsTotal = privateLessons.reduce((sum, lesson) => sum + (lesson.amount || 0), 0);
      const groupLessonsTotal = groupLessons.reduce((sum, lesson) => sum + (lesson.amount || 0), 0);
      const invoicesTotal = invoiceList.reduce((sum, invoice) => sum + (invoice.balance || 0), 0);
      const creditsTotal = creditList.reduce((sum, credit) => sum + (credit.amount || 0), 0);
      const totalBalance = privateLessonsTotal + groupLessonsTotal + invoicesTotal - creditsTotal;

      // Match legacy: use email_template for customer statement, fallback to defaults.
      const customerStatementTemplate = await this.emailTemplateRepository.findOne({
        where: { emailTypeId: EmailSendObjectTypeEnum.CUSTOMER_STATEMENT },
      });
      const emailSubject =
        customerStatementTemplate?.subject || 'Customer Statement from Arcadia Academy of Music';
      const emailHeader =
        customerStatementTemplate?.header || 'Please find the customer statement below';
      const emailFooter = customerStatementTemplate?.footer || '';

      return {
        body: {
          privateLessonsDue: privateLessons,
          groupLessonsDue: groupLessons,
          invoices: invoiceList,
          credits: creditList,
          totalBalance,
          customerEmails: emailList,
          emailSubject,
          emailHeader,
          emailFooter,
        },
      };
    } catch (error) {
      console.error('Error in getEmailStatementData service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve email statement data: ${error.message}`);
    }
  }  

}
