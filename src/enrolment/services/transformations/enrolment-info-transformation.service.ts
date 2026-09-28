import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { EnrolmentInfoDto, EnrolmentInfoDataDto, EnrolmentRateDto, EnrolmentDiscountsDto } from '../../dto/enrolment-info-response.dto';
import { EnrolmentDiscount } from '../../entities/enrolment-discount.entity';
import { Program } from '../../../program/entities/program.entity';
import { formatDate } from '../../../utils/date-utils';
import { formatDuration, formatCurrency } from '../../../utils/formatters';

@Injectable()
export class EnrolmentInfoTransformationService {
  /**
   * Transform enrolment entity to EnrolmentInfoDto
   */
  transformEnrolmentToInfo(enrolment: any): EnrolmentInfoDto {
    const student = enrolment.student;
    const course = enrolment.course;
    const program = course?.program;
    const courseSchedule = course?.courseSchedule?.[0];
    const teacher = courseSchedule?.teacher;

    // Determine if program is private (type = 1) or group (type = 2)
    const isPrivate = program?.type === Program.TYPE_PRIVATE_PROGRAM;

    // Get all program rates from courseProgramRates
    const rates = this.formatAllRates(course?.courseProgramRates);

    // Get discounts based on program type
    const discounts = this.formatDiscounts(enrolment.discounts, isPrivate);

    const teacherName = teacher?.profile
      ? `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim()
      : '';

    // Get student name
    const studentName = `${student?.firstName || ''} ${student?.lastName || ''}`.trim();

    // Get customer name from student's user profile
    const customerUser = student?.user;
    const customerName = customerUser?.profile
      ? `${customerUser.profile.firstname || ''} ${customerUser.profile.lastname || ''}`.trim()
      : '';

    // Format auto renewal status
    const autoRenewal = enrolment.isAutoRenew ? 'Enabled' : 'Disabled';

    // Format online status
    const online = enrolment.isOnline ? 'Yes' : 'No';

    // Format duration
    const duration = formatDuration(courseSchedule?.duration);

    const dtoData = {
      id: enrolment.id,
      programId: program?.id || null,
      studentId: student?.id || null,
      customerId: customerUser?.id || null,
      program: program?.name || '',
      programType: program?.type === Program.TYPE_PRIVATE_PROGRAM ? 'Private' : 'Group',
      teacher: teacherName,
      rates,
      discounts,
      autoRenewal,
      duration,
      student: studentName,
      customer: customerName,
      online,
      // The pricing decision, so the screen it was made on can show it back.
      // Compared against null rather than tested for truthiness - this
      // codebase has a real enrolment with id 0, and the same habit is what
      // hid it.
      pricingTier:
        enrolment.pricingTier === null || enrolment.pricingTier === undefined
          ? null
          : Number(enrolment.pricingTier),
      // tinyint(1) arrives as 1/0, and a driver that hands back the string "0"
      // makes a truthiness test report every enrolment as defaulted.
      pricingTierIsDefaulted: Number(enrolment.pricingTierIsDefaulted) === 1,
      keepsPreviousRate: Number(enrolment.keepsPreviousRate) === 1,
      previousRateReason: enrolment.previousRateReason ?? null,
      pricingBasis: this.formatPricingBasis(enrolment),
    };

    return plainToInstance(EnrolmentInfoDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * How this enrolment is priced, in one phrase.
   *
   * Three states, and they are not the same thing. A held rate is a decision
   * somebody made and recorded; no tier at all is simply an enrolment that
   * predates the September structure. Collapsing the two would let a location
   * "correct" a rate a customer was promised.
   */
  private formatPricingBasis(enrolment: any): string {
    if (Number(enrolment.keepsPreviousRate) === 1) {
      return 'Previous rate';
    }

    if (enrolment.pricingTier === null || enrolment.pricingTier === undefined) {
      return 'Not on September pricing';
    }

    return Number(enrolment.pricingTierIsDefaulted) === 1
      ? `Tier ${Number(enrolment.pricingTier)} (needs review)`
      : `Tier ${Number(enrolment.pricingTier)}`;
  }

  /**
   * Format all program rates sorted by startDate ascending
   */
  private formatAllRates(courseProgramRates: any[]): EnrolmentRateDto[] {
    if (!courseProgramRates || courseProgramRates.length === 0) {
      return [];
    }

    // Sort by startDate ascending (oldest first)
    const sortedRates = [...courseProgramRates].sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    return sortedRates.map(rate => ({
      fromDate: formatDate(rate.startDate),
      toDate: formatDate(rate.endDate),
      amount: formatCurrency(Number(rate.programRate)),
    }));
  }

  /**
   * Format discounts based on program type
   * - Private Program: PF Discount + Multiple Enrol. Discount
   * - Group Program: Single Discount ($ or %)
   */
  private formatDiscounts(discounts: any[], isPrivate: boolean): EnrolmentDiscountsDto {
    if (isPrivate) {
      return this.formatPrivateDiscounts(discounts);
    }
    return this.formatGroupDiscounts(discounts);
  }

  /**
   * Format discounts for Private Program
   */
  private formatPrivateDiscounts(discounts: any[]): EnrolmentDiscountsDto {
    const pfDiscount = this.findDiscountByType(discounts, EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY);
    const multipleEnrol = this.findDiscountByType(discounts, EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT);

    return {
      pfDiscount: this.hasValue(pfDiscount) ? `${pfDiscount.discount}%` : 'Not set',
      multipleEnrolDiscount: this.hasValue(multipleEnrol) ? `$${multipleEnrol.discount}` : 'Not set',
    };
  }

  /**
   * Format discounts for Group Program
   */
  private formatGroupDiscounts(discounts: any[]): EnrolmentDiscountsDto {
    const groupDiscount = this.findDiscountByType(discounts, EnrolmentDiscount.TYPE_GROUP);

    if (!this.hasValue(groupDiscount)) {
      return { discount: 'Not set' };
    }

    // discountType: 0 = Percentage, 1 = Dollar
    const formatted = groupDiscount.discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR
      ? `$${groupDiscount.discount}`
      : `${groupDiscount.discount}%`;

    return { 
      discount: formatted,
      discountType: groupDiscount.discountType, // Include discountType for frontend toggle
    };
  }

  /**
   * Find discount by type
   */
  private findDiscountByType(discounts: any[], type: number): any | undefined {
    return discounts?.find(d => d.type === type);
  }

  /**
   * Check if discount has a valid value
   */
  private hasValue(discount: any): boolean {
    return discount?.discount != null && discount.discount !== '';
  }

  /**
   * Transform enrolment data to EnrolmentInfoDataDto
   */
  transformEnrolmentInfoData(enrolment: any): EnrolmentInfoDataDto {
    const enrolmentInfo = this.transformEnrolmentToInfo(enrolment);

    const dtoData = {
      body: enrolmentInfo,
    };

    return plainToInstance(EnrolmentInfoDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}
