import { Injectable } from '@nestjs/common';
import {
  StudentInfoDto,
  CustomerInfoDto,
  StudentDetailsDataDto,
  PrivateLessonDefaultsDto,
} from '../../dto/student-info-response.dto';
import { formatBirthDate } from '../../../utils/date-utils';
import { formatPhoneNumber } from '../../../utils/formatters';
import { calculateAge, getGenderName, formatStudentStatus } from '../../utils/student.utils';

@Injectable()
export class StudentInfoTransformationService {
  /**
   * Transform student entity with user relations to StudentDetailsResponseDto
   */
  transformStudentDetailsToDto(
    student: any,
    privateLessonDefaults?: PrivateLessonDefaultsDto | null,
  ): StudentDetailsDataDto {
    const studentInfo = this.transformStudentInfo(student);
    const customerInfo = this.transformCustomerInfo(student);

    return {
      student: studentInfo,
      customer: customerInfo,
      privateLessonDefaults: privateLessonDefaults ?? null,
    };
  }

  /**
   * Transform student entity to StudentInfoDto
   */
  private transformStudentInfo(student: any): StudentInfoDto {
    const fullName = `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
    const birthday = formatBirthDate(student?.birthDate || '');
    const age = calculateAge(student?.birthDate || '');
    const gender = getGenderName(student?.gender);
    const status = formatStudentStatus(student?.status || 0);
    const notes = student?.note || '';
    const mediaAndOnlineLessonConsent =
    student?.mediaAndOnlineLessonConsent === true
      ? true
      : student?.mediaAndOnlineLessonConsent === false
        ? false
        : null;

    return {
      id: student?.id,
      fullName,
      birthDate: birthday,
      age,
      gender,
      status,
      note: notes,
      mediaAndOnlineLessonConsent: mediaAndOnlineLessonConsent,
    };
  }

  /**
   * Transform customer/user information to CustomerInfoDto
   */
  private transformCustomerInfo(student: any): CustomerInfoDto {
    const user = student?.user;
    
    if (!user) {
      return {
        id: 0,
        name: '',
        phone: '',
      };
    }

    const customerName = `${user.profile?.firstname || ''} ${user.profile?.lastname || ''}`.trim();
    const customerPhone = this.getPrimaryPhone(user);

    return {
      id: user?.id,
      name: customerName,
      phone: customerPhone,
    };
  }

  /**
   * Get primary phone number from user contacts
   */
  private getPrimaryPhone(user: any): string {
    if (!user || !user.contacts || !Array.isArray(user.contacts) || user.contacts.length === 0) {
      return '';
    }

    // Find primary contact
    const primaryContact = user.contacts.find(
      (contact: any) => contact?.isPrimary === true || contact?.isPrimary === 1 || Number(contact?.isPrimary) === 1
    );

    // Try to get phone from primary contact first
    if (primaryContact && primaryContact.phones && Array.isArray(primaryContact.phones) && primaryContact.phones.length > 0) {
      const phone = primaryContact?.phones[0];
      if (phone && phone.number) {
        return formatPhoneNumber(phone.number);
      }
    }

    // Fallback: get first phone from any contact
    for (const contact of user.contacts) {
      if (contact.phones && Array.isArray(contact.phones) && contact.phones.length > 0) {
        const phone = contact?.phones[0];
        if (phone && phone.number) {
          return formatPhoneNumber(phone.number);
        }
      }
    }

    return '';
  }

}
