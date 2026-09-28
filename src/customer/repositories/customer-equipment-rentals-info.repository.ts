import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CustomerEquipmentRentalsInfoRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getEquipmentRentalsCustomerInfo(customerId: number): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.contacts', 'contacts', 'contacts.isDeleted = false')
      .leftJoinAndSelect('contacts.addresses', 'addresses', 'addresses.isDeleted = false')
      .leftJoinAndSelect('addresses.city', 'city')
      .leftJoinAndSelect('contacts.emails', 'emails', 'emails.isDeleted = false')
      .leftJoinAndSelect('contacts.phones', 'phones', 'phones.isDeleted = false')
      .where('user.id = :customerId', { customerId })
      .andWhere('user.isDeleted = false')
      .orderBy('contacts.isPrimary', 'DESC')
      .addOrderBy('contacts.labelId', 'ASC')
      .getOne();
  }
}