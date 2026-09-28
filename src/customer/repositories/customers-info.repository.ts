import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { UserEmail } from '../../user/entities/user-email.entity';
import { UserPhone } from '../../user/entities/user-phone.entity';
import { UserAddress } from '../../user/entities/user-address.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { City } from '../../location/entities/city.entity';
import { Province } from '../../location/entities/province.entity';
import { Country } from '../../location/entities/country.entity';
import { CustomerDiscount } from '../entities/customer-discount.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';
import { CustomerPaymentPreference } from '../entities/customer-payment-preference.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { Program } from '../../program/entities/program.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { Label } from '../../user/entities/label.entity';

@Injectable()
export class CustomersInfoRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(UserPhone)
    private readonly userPhoneRepository: Repository<UserPhone>,
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
    @InjectRepository(UserContact)
    private readonly userContactRepository: Repository<UserContact>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(Province)
    private readonly provinceRepository: Repository<Province>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    @InjectRepository(CustomerDiscount)
    private readonly customerDiscountRepository: Repository<CustomerDiscount>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(CustomerPaymentPreference)
    private readonly customerPaymentPreferenceRepository: Repository<CustomerPaymentPreference>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
  ) {}

  async getCustomerContactLabels(customerId: number): Promise<Array<{ id: number; name: string }>> {
    const labels = await this.labelRepository.find({
      where: [
        { userAdded: 0 },
        { userAdded: customerId },
      ],
      order: {
        userAdded: 'ASC',
        id: 'ASC',
      },
      select: ['id', 'name'],
    });

    return labels.map((label) => ({
      id: label.id,
      name: label.name,
    }));
  }

  /**
   * Get customer emails with contact information
   * Based on legacy email functionality
   */
  async getCustomerEmails(customerId: number, locationId: number): Promise<any[]> {
    const emails = await this.userEmailRepository
      .createQueryBuilder('userEmail')
      .leftJoinAndSelect('userEmail.userContact', 'userContact')
      .leftJoinAndSelect('userContact.label', 'label')
      .leftJoinAndSelect('userContact.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('userEmail.isDeleted = false')
      .andWhere('userContact.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .orderBy('userContact.isPrimary', 'DESC') // Primary emails first
      .addOrderBy('userEmail.id', 'ASC')
      .getMany();

    return emails.map(email => ({
      id: email.id,
      email: email.email,
      note: email.note || '',
      label: UserContact.getLabelName(email.userContact.labelId, email.userContact.label?.name),
      isPrimary: Boolean(email.userContact.isPrimary),
    }));
  }

  /**
   * Get customer phone numbers with contact information
   * Based on legacy phone functionality
   */
  async getCustomerPhones(customerId: number, locationId: number): Promise<any[]> {
    const phones = await this.userPhoneRepository
      .createQueryBuilder('userPhone')
      .leftJoinAndSelect('userPhone.contact', 'userContact')
      .leftJoinAndSelect('userContact.label', 'label')
      .leftJoinAndSelect('userContact.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('userPhone.isDeleted = false')
      .andWhere('userContact.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .orderBy('userContact.isPrimary', 'DESC') // Primary phones first
      .addOrderBy('userPhone.id', 'ASC')
      .getMany();

    return phones.map(phone => ({
      id: phone.id,
      number: phone.number,
      extension: phone.extension || null,
      note: phone.note || '',
      label: UserContact.getLabelName(phone.contact.labelId, phone.contact.label?.name),
      isPrimary: Boolean(phone.contact.isPrimary),
    }));
  }

  /**
   * Get customer addresses with contact information
   * Based on legacy address functionality
   */
  async getCustomerAddresses(customerId: number, locationId: number): Promise<any[]> {
    const addresses = await this.userAddressRepository
      .createQueryBuilder('userAddress')
      .leftJoinAndSelect('userAddress.userContact', 'userContact')
      .leftJoinAndSelect('userContact.label', 'label')
      .leftJoinAndSelect('userAddress.city', 'city')
      .leftJoinAndSelect('userAddress.province', 'province')
      .leftJoinAndSelect('userAddress.country', 'country')
      .leftJoinAndSelect('userContact.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('userAddress.isDeleted = false')
      .andWhere('userContact.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .orderBy('userContact.isPrimary', 'DESC') // Primary addresses first
      .addOrderBy('userAddress.id', 'ASC')
      .getMany();

    return addresses.map(address => ({
      id: address.id,
      address: address.address,
      city: address.city?.name || '',
      province: address.province?.name || '',
      country: address.country?.name || '',
      postalCode: address.postalCode || '',
      label: UserContact.getLabelName(address.userContact.labelId, address.userContact.label?.name),
      isPrimary: Boolean(address.userContact.isPrimary),
    }));
  }

  /**
   * Get customer discount information
   * Based on legacy discount functionality
   */
  async getCustomerDiscount(customerId: number, locationId: number): Promise<any> {
    const discount = await this.customerDiscountRepository
      .createQueryBuilder('customerDiscount')
      .leftJoinAndSelect('customerDiscount.customer', 'customer')
      .leftJoinAndSelect('customer.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(customer.id AS CHAR)')
      .where('customer.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('customerDiscount.isDeleted = false')
      .andWhere('customer.isDeleted = false')
      .getOne();

    return discount ? {
      id: discount.id,
      value: parseFloat(discount.value.toString()),
    } : null;
  }

  /**
   * Get all payment frequencies for enrolment metadata.
   */
  async getPaymentFrequencies(): Promise<{ id: number; name: string; frequencyLength: number }[]> {
    const result = await this.paymentFrequencyRepository.find({
      order: { id: 'ASC' },
    });

    return result.map((pf) => ({
      id: pf.id,
      name: pf.name,
      frequencyLength: pf.frequencyLength,
    }));
  }

  /**
   * Get all active private programs with rate for enrolment metadata.
   */
  async getPrivatePrograms(): Promise<{ id: number; name: string; rate: number | null }[]> {
    const programs = await this.programRepository.find({
      where: {
        isDeleted: false,
        status: Program.STATUS_ACTIVE,
        type: Program.TYPE_PRIVATE_PROGRAM,
      },
      order: {
        name: 'ASC',
      },
      select: ['id', 'name', 'rate'],
    });

    return programs.map((program) => ({
      id: program.id,
      name: program.name,
      rate: program.rate ?? null,
    }));
  }

  /**
   * Get customer opening balance information
   * Based on legacy opening balance functionality
   */
  async getCustomerOpeningBalance(customerId: number, locationId: number): Promise<any> {
    // First try to find positive opening balance (debit)
    const positiveOpeningBalance = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.lineItems', 'lineItem')
      .leftJoinAndSelect('invoice.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('lineItem.itemTypeId = :itemTypeId', { itemTypeId: ItemTypeEnum.TYPE_OPENING_BALANCE })
      .andWhere('invoice.balance > 0')
      .andWhere('invoice.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .getOne();

    if (positiveOpeningBalance) {
      return {
        id: positiveOpeningBalance.id,
        amount: parseFloat(positiveOpeningBalance.balance.toString()),
        type: 'positive',
      };
    }

    // If no positive opening balance, try to find negative opening balance (credit)
    const negativeOpeningBalance = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.lineItems', 'lineItem')
      .leftJoinAndSelect('invoice.user', 'user')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('lineItem.itemTypeId = :itemTypeId', { itemTypeId: ItemTypeEnum.TYPE_OPENING_BALANCE })
      .andWhere('invoice.balance < 0')
      .andWhere('invoice.isDeleted = false')
      .andWhere('user.isDeleted = false')
      .getOne();

    if (negativeOpeningBalance) {
      return {
        id: negativeOpeningBalance.id,
        amount: parseFloat(negativeOpeningBalance.balance.toString()),
        type: 'negative',
      };
    }

    return null;
  }

  /**
   * Get customer payment preference information
   * Based on legacy payment preference functionality
   */
  async getCustomerPaymentPreference(customerId: number, locationId: number): Promise<any> {
    const paymentPreference = await this.customerPaymentPreferenceRepository
      .createQueryBuilder('paymentPreference')
      .leftJoinAndSelect('paymentPreference.customer', 'customer')
      .leftJoinAndSelect('customer.userLocation', 'userLocation')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(customer.id AS CHAR)')
      .leftJoin('payment_method', 'paymentMethod', 'paymentMethod.id = paymentPreference.paymentMethodId')
      .where('customer.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('paymentPreference.isDeleted = false')
      .andWhere('customer.isDeleted = false')
      .getOne();

    if (!paymentPreference) {
      return null;
    }

    // Get payment method name
    const paymentMethod = await this.paymentMethodRepository
      .createQueryBuilder('paymentMethod')
      .where('paymentMethod.id = :paymentMethodId', { paymentMethodId: paymentPreference.paymentMethodId })
      .getOne();

    // Safely format expiryDate - handle both Date objects and strings
    let formattedExpiryDate: string | null = null;
    if (paymentPreference.expiryDate) {
      if (paymentPreference.expiryDate instanceof Date) {
        formattedExpiryDate = paymentPreference.expiryDate.toISOString().split('T')[0];
      } else {
        // TypeORM may return date columns as strings, so handle both cases
        const expiryDateValue = paymentPreference.expiryDate as Date | string;
        if (typeof expiryDateValue === 'string') {
          const dateObj = new Date(expiryDateValue);
          if (!isNaN(dateObj.getTime())) {
            formattedExpiryDate = dateObj.toISOString().split('T')[0];
          } else {
            // If parsing fails, use the string as-is if it's already in YYYY-MM-DD format
            formattedExpiryDate = expiryDateValue.split('T')[0];
          }
        }
      }
    }

    return {
      id: paymentPreference.id,
      dayOfMonth: paymentPreference.dayOfMonth,
      paymentMethodId: paymentPreference.paymentMethodId,
      paymentMethodName: paymentMethod?.name || '',
      expiryDate: formattedExpiryDate,
      isPreferredPaymentEnabled: Boolean(paymentPreference.isPreferredPaymentEnabled),
    };
  }

  /**
   * Get customer profile details
   * Based on legacy profile functionality
   */
  async getCustomerProfile(customerId: number, locationId: number): Promise<any> {
    const customer = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userLocation', 'userLocation')
      .leftJoinAndSelect('user.customerReferralSource', 'customerReferralSource')
      .leftJoinAndSelect('customerReferralSource.referralSource', 'referralSource')
      .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('authAssignment.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = false')
      .getOne();

    if (!customer) {
      return null;
    }

    // Get public identity (name)
    const getPublicIdentity = (): string => {
      if (customer.profile && customer.profile.firstname && customer.profile.lastname) {
        return `${customer.profile.firstname} ${customer.profile.lastname}`.trim();
      }
      if (customer.username) {
        return customer.username;
      }
      return '';
    };

    // Get status
    const getStatus = (): string => {
      return User.getStatusName(customer.status);
    };

    // Get referral source
    const getReferralSource = (): string => {
      if (customer.customerReferralSource) {
        if (customer.customerReferralSource.referralSource && customer.customerReferralSource.referralSource.id === 4) {
          // If it's "Other", return the description
          return customer.customerReferralSource.description || '';
        } else if (customer.customerReferralSource.referralSource) {
          // Return the referral source name
          return customer.customerReferralSource.referralSource.name || '';
        }
      }
      return '';
    };

    return {
      name: getPublicIdentity(),
      role: 'Customer',
      referralSource: getReferralSource(),
      status: getStatus(),
    };
  }

}
