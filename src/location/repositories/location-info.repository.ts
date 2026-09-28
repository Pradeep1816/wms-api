import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../entities/location.entity';
import { LocationDebt } from '../entities/location-debt.entity';

@Injectable()
export class LocationDetailsRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(LocationDebt)
    private readonly locationDebtRepository: Repository<LocationDebt>,
  ) {}

  /**
   * Get complete location details with all relationships by slug
   */
  async findLocationBySlug(locationSlug: string): Promise<Location | null> {
    return this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.city', 'city')
      .leftJoinAndSelect('location.province', 'province')
      .leftJoinAndSelect('location.country', 'country')
      .where('location.slug = :slug', { slug: locationSlug })
      .andWhere('location.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Get royalty value for a location
   */
  async getRoyaltyValue(locationId: number): Promise<number> {
    const royalty = await this.locationDebtRepository.findOne({
      where: {
        locationId,
        type: LocationDebt.TYPE_ROYALTY,
      },
    });
    return royalty?.value || 0;
  }

  /**
   * Get advertisement value for a location
   */
  async getAdvertisementValue(locationId: number): Promise<number> {
    const advertisement = await this.locationDebtRepository.findOne({
      where: {
        locationId,
        type: LocationDebt.TYPE_ADVERTISEMENT,
      },
    });
    return advertisement?.value || 0;
  }
}
