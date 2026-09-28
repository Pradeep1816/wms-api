import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserContact } from '../entities/user-contact.entity';
import { UserEmail } from '../entities/user-email.entity';
import { UserPhone } from '../entities/user-phone.entity';
import { UserAddress } from '../entities/user-address.entity';
import { UserLocation } from '../entities/user-location.entity';
import { City } from '../../location/entities/city.entity';
import { StudentCsv } from '../../student/entities/student-csv.entity';

const DEFAULT_PROVINCE_ID = 1;
const DEFAULT_COUNTRY_ID = 1;
const DEFAULT_OPENING_BALANCE = '0';

@Injectable()
export class UserImportRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(StudentCsv)
    private readonly studentCsvRepository: Repository<StudentCsv>,
  ) {}

  /**
   * Find a customer (user with role customer) in location by Billing Home Tel (phone number).
   */
  async findUserByPhoneInLocation(
    phoneNumber: string,
    locationId: number,
    manager: EntityManager,
  ): Promise<User | null> {
    const user = await manager
      .createQueryBuilder(User, 'user')
      .innerJoin('user.contacts', 'uc', 'uc.isDeleted = 0')
      .innerJoin(UserPhone, 'phone', 'phone.userContactId = uc.id AND phone.isDeleted = 0')
      .innerJoin(UserLocation, 'ul', 'ul.userId = user.id')
      .leftJoin('rbac_auth_assignment', 'raa', 'raa.user_id = CAST(user.id AS CHAR)')
      .where('phone.number = :phoneNumber', { phoneNumber: (phoneNumber || '').trim() })
      .andWhere('ul.locationId = :locationId', { locationId })
      .andWhere('raa.item_name = :role', { role: 'customer' })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: 0 })
      .getOne();
    return user || null;
  }

  /**
   * Create UserContact with a specific label (e.g. HOME).
   */
  async createUserContactWithLabel(
    userId: number,
    labelId: number,
    isPrimary: boolean,
    manager: EntityManager,
  ): Promise<UserContact> {
    const contact = new UserContact();
    contact.userId = userId;
    contact.labelId = labelId;
    contact.isPrimary = isPrimary;
    contact.isDeleted = false;
    return manager.save(UserContact, contact);
  }

  /**
   * Create UserEmail linked to a contact.
   */
  async createUserEmail(
    userContactId: number,
    email: string,
    manager: EntityManager,
  ): Promise<void> {
    const userEmail = new UserEmail();
    userEmail.userContactId = userContactId;
    userEmail.email = (email || '').trim();
    userEmail.isDeleted = false;
    await manager.save(UserEmail, userEmail);
  }

  /**
   * Create UserPhone linked to a contact.
   */
  async createUserPhone(
    userContactId: number,
    number: string,
    extension?: string,
    manager?: EntityManager,
  ): Promise<void> {
    const phone = new UserPhone();
    phone.userContactId = userContactId;
    phone.number = (number || '').trim();
    phone.extension = extension ? parseInt(extension, 10) || 0 : 0;
    phone.note = '';
    phone.isDeleted = false;
    const em = manager ?? this.userRepository.manager;
    await em.save(UserPhone, phone);
  }

  /**
   * Find or create City by name (province_id = 1), then create UserAddress.
   */
  async createUserAddress(
    userContactId: number,
    address: string,
    cityName: string,
    postalCode: string,
    createdByUserId: number,
    manager: EntityManager,
  ): Promise<void> {
    let city = await manager.findOne(City, { where: { name: cityName } });
    if (!city) {
      city = new City();
      city.name = cityName;
      city.provinceId = DEFAULT_PROVINCE_ID;
      city.isDeleted = false;
      city.createdByUserId = createdByUserId;
      city.updatedByUserId = createdByUserId;
      city.createdOn = new Date();
      city.updatedOn = new Date();
      await manager.save(City, city);
    }
    const addr = new UserAddress();
    addr.userContactId = userContactId;
    addr.address = (address || '').trim();
    addr.cityId = city.id;
    addr.provinceId = DEFAULT_PROVINCE_ID;
    addr.countryId = DEFAULT_COUNTRY_ID;
    addr.postalCode = (postalCode || '').trim();
    addr.isDeleted = false;
    await manager.save(UserAddress, addr);
  }

  /**
   * Save a row to student_csv (import snapshot).
   */
  async saveStudentCsv(
    studentId: number,
    row: Record<string, string>,
    manager: EntityManager,
  ): Promise<void> {
    const openingBalance = (row['Balance To Date'] || '').trim() || DEFAULT_OPENING_BALANCE;
    let birthDate = '';
    if (row['Date of Birth']) {
      const m = row['Date of Birth'].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) birthDate = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
    const csv = new StudentCsv();
    csv.studentId = studentId;
    csv.firstName = (row['First Name'] || '').trim();
    csv.lastName = (row['Last Name'] || '').trim();
    csv.email = (row['Email Address'] || '').trim();
    csv.address = (row['Address'] || '').trim();
    csv.city = (row['City'] || '').trim();
    csv.province = (row['Province'] || '').trim();
    csv.postalCode = (row['Postal Code'] || '').trim();
    csv.country = (row['Country'] || '').trim();
    csv.homeTel = (row['Home Tel'] || '').trim();
    csv.otherTel = (row['Other Tel'] || '').trim();
    csv.birthDate = birthDate;
    csv.billingFirstName = (row['Billing First Name'] || '').trim();
    csv.billingLastName = (row['Billing Last Name'] || '').trim();
    csv.billingEmail = (row['Billing Email Address'] || '').trim();
    csv.billingAddress = (row['Billing Address'] || '').trim();
    csv.billingCity = (row['Billing City'] || '').trim();
    csv.billingProvince = (row['Billing Province'] || '').trim();
    csv.billingPostalCode = (row['Billing Postal Code'] || '').trim();
    csv.billingCountry = (row['Billing Country'] || '').trim();
    csv.billingHomeTel = (row['Billing Home Tel'] || '').trim();
    csv.billingOtherTel = (row['Billing Other Tel'] || '').trim();
    csv.billingWorkTel = (row['Billing Work Tel'] || '').trim();
    csv.billingWorkTelExt = (row['Billing Work Tel Ext.'] || '').trim();
    csv.notes = (row['Comments'] || '').trim();
    csv.openingBalance = openingBalance;
    await manager.save(StudentCsv, csv);
  }
}
