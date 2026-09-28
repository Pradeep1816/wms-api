import { Injectable } from '@nestjs/common';
import {
  BaseUserDataDto,
  CustomerUserDataDto,
  TeacherUserDataDto,
  StudentUserDataDto,
  AdminUserDataDto,
  UserListDataDto,
} from '../../dto/user-list-response.dto';
import { plainToInstance } from 'class-transformer';
import { User } from '../../entities/user.entity';
import { RolesEnum } from '../../../auth/enums/roles.enum';
import { formatCurrency } from 'src/utils/formatters';
import { getSafeBalance } from 'src/utils/helper';
import { StudentStatus } from 'src/student/enums/student-status.enum';
@Injectable()
export class UserListTransformationService {
  /**
   * Transform user raw data to appropriate DTO based on role
   * @param user - User raw data from repository
   * @param role - User role
   * @returns BaseUserDataDto | CustomerUserDataDto | TeacherUserDataDto | AdminUserDataDto
   */
  transformUserToDto(
    user: any,
    role: string,
  ): BaseUserDataDto | CustomerUserDataDto | TeacherUserDataDto | StudentUserDataDto | AdminUserDataDto {
    const baseData = this.buildBaseData(user);
    const transformer = this.getRoleTransformer(role);
    return transformer(baseData, user);
  }

  /**
   * Build base user data common to all roles
   */
  private buildBaseData(user: any): BaseUserDataDto {
    // Handle student role - repository returns structure with student data and nested user
    // Check for explicit student structure: has student property OR has firstName at root with nested user
    // Regular users have profile.firstname, not firstName at root level
    const isStudentData = user.student || (user.firstName && user.user && !user.profile);
    
    if (isStudentData) {
      const student = user.student || user;
      return {
        userId: student.id,
        isActive: this.getStudentStatus(student.status),
        firstName: student.firstName || user.firstName || '',
        lastName: student.lastName || user.lastName || '',
      };
    }
    
    // Regular user data structure (for customer, teacher, admin, etc.)
    return {
      userId: user.id,
      isActive: this.getStatus(user.status),
      firstName: user.profile?.firstname || '',
      lastName: user.profile?.lastname || '',
      email: this.extractEmail(user.contacts),
    };
  }

  /**
   * Extract email from contacts (primary contact first, then fallback)
   */
  private extractEmail(contacts: any[]): string {
    if (!contacts?.length) return '';

    const primaryContact = this.findPrimaryContact(contacts);
    const email = primaryContact?.emails?.[0]?.email;
    
    return email || this.findFirstEmail(contacts);
  }

  /**
   * Extract phone numbers from contacts (all phone numbers, comma-separated)
   * Primary contact phones come first, then other contacts
   */
  private extractPhone(contacts: any[]): string {
    if (!contacts?.length) return '';

    const phoneNumbers: string[] = [];
    
    // First, get phones from primary contact
    const primaryContact = this.findPrimaryContact(contacts);
    if (primaryContact?.phones?.length > 0) {
      primaryContact.phones.forEach((phone: any) => {
        if (phone?.number) {
          phoneNumbers.push(phone.number);
        }
      });
    }
    
    // Then, get phones from other contacts (excluding primary)
    contacts.forEach((contact) => {
      if (contact !== primaryContact && contact.phones?.length > 0) {
        contact.phones.forEach((phone: any) => {
          if (phone?.number && !phoneNumbers.includes(phone.number)) {
            phoneNumbers.push(phone.number);
          }
        });
      }
    });
    
    return phoneNumbers.join(', ');
  }

  /**
   * Find primary contact (handles both boolean and number formats)
   */
  private findPrimaryContact(contacts: any[]): any | undefined {
    return contacts.find(
      (contact) => contact.isPrimary === true || contact.isPrimary === 1
    );
  }

  /**
   * Find first available email from any contact
   */
  private findFirstEmail(contacts: any[]): string {
    const contact = contacts.find((c) => c.emails?.length > 0);
    return contact?.emails?.[0]?.email || '';
  }

  /**
   * Extract all email addresses from contacts
   * Primary contact emails come first, then other contacts
   */
  private extractAllEmails(contacts: any[]): string {
    if (!contacts?.length) return '';

    const emails: string[] = [];
    
    // First, get emails from primary contact
    const primaryContact = this.findPrimaryContact(contacts);
    if (primaryContact?.emails?.length > 0) {
      primaryContact.emails.forEach((email: any) => {
        if (email?.email) {
          emails.push(email.email);
        }
      });
    }
    
    // Then, get emails from other contacts (excluding primary)
    contacts.forEach((contact) => {
      if (contact !== primaryContact && contact.emails?.length > 0) {
        contact.emails.forEach((email: any) => {
          if (email?.email && !emails.includes(email.email)) {
            emails.push(email.email);
          }
        });
      }
    });
    
    return emails.join(', ');
  }

  /**
   * Find first available phone from any contact
   */
  private findFirstPhone(contacts: any[]): string {
    const contact = contacts.find(
      (c) => Array.isArray(c.phones) && c.phones.length > 0 && c.phones[0]?.number
    );
    return contact?.phones?.[0]?.number || '';
  }

  /**
   * Get role-specific transformer function
   */
  private getRoleTransformer(role: string) {
    const transformers = {
      [RolesEnum.CUSTOMER]: this.transformCustomer.bind(this),
      [RolesEnum.TEACHER]: this.transformTeacher.bind(this),
      [RolesEnum.STUDENT]: this.transformStudent.bind(this),
      [RolesEnum.ADMINISTRATOR]: this.transformAdmin.bind(this),
      [RolesEnum.STAFFMEMBER]: this.transformAdmin.bind(this),
      [RolesEnum.OWNER]: this.transformAdmin.bind(this),
    };

    return transformers[role] || this.transformAdmin.bind(this);
  }

  /**
   * Transform to CustomerUserDataDto
   */
  private transformCustomer(baseData: BaseUserDataDto, user: any): CustomerUserDataDto {
    const dtoData: CustomerUserDataDto = {
      ...baseData,
      students: user.students?.map(student => `${student.firstName} ${student.lastName}`).join(', ') || '',
      balance: formatCurrency(user.customerAccount?.balance || 0),
    };
    return plainToInstance(CustomerUserDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform to TeacherUserDataDto
   */
  private transformTeacher(baseData: BaseUserDataDto, user: any): TeacherUserDataDto {
    const dtoData: TeacherUserDataDto = {
      ...baseData,
      phoneNumber: this.extractPhone(user.contacts),
    };
    return plainToInstance(TeacherUserDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform to StudentUserDataDto
   */
  private transformStudent(baseData: BaseUserDataDto, user: any): StudentUserDataDto {
    const customer = user.user;
    
    let customerName = '';
    // Use userProfile alias from query or fallback to profile
    const customerProfile = customer?.userProfile || customer?.profile;
    if (customerProfile) {
      customerName = `${customerProfile.firstname || ''} ${customerProfile.lastname || ''}`.trim();
    }
    
    const dtoData: StudentUserDataDto = {
      id: baseData.userId,
      isActive: baseData.isActive,
      firstName: baseData.firstName,
      lastName: baseData.lastName,
      customerName,
      phoneNumber: this.extractPhone(customer?.contacts || []),
      email: this.extractAllEmails(customer?.contacts || []),
    };
    return plainToInstance(StudentUserDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform to AdminUserDataDto (default for admin, staff, owner)
   */
  private transformAdmin(baseData: BaseUserDataDto): AdminUserDataDto {
    return plainToInstance(AdminUserDataDto, baseData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple users raw data to DTO array
   * @param users - Array of user raw data
   * @param role - User role
   * @returns Array of appropriate DTOs
   */
  transformUsersToDtos(
    users: any[],
    role: string,
  ): (BaseUserDataDto | CustomerUserDataDto | TeacherUserDataDto | StudentUserDataDto | AdminUserDataDto)[] {
    return users.map(user => this.transformUserToDto(user, role));
  }

  /**
   * Create pagination metadata
   * @param total - Total number of items
   * @param page - Current page
   * @param limit - Items per page
   * @returns { page: number; limit: number; total: number; totalPages: number; }
   */
    createMeta(total: number, page: number, limit: number): {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    } {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
    };
  }

  /**
   * Convert status number to boolean or 'unknown'
   * @param status - User status number
   * @returns boolean | 'unknown'
   */
  private getStatus(status: number): boolean | 'unknown' {
    if (status === User.STATUS_ACTIVE) {
      return true;
    } else if (status === User.STATUS_NOT_ACTIVE) {
      return false;
    }
    return 'unknown';
  }

  /**
   * Convert student status number to boolean or 'unknown'
   */
  private getStudentStatus(status: number): boolean | 'unknown' {
    if (status === StudentStatus.ACTIVE) {
      return true;
    } else if (status === StudentStatus.INACTIVE) {
      return false;
    } else if (status === StudentStatus.DRAFT) {
      return false;
    }
    return 'unknown';
  }
}

