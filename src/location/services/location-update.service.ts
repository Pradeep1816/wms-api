import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { LocationUpdateRepository } from '../repositories/location-update.repository';
import { UpdateLocationRequestDto } from '../dto/update-location-request.dto';
import { UpdateLocationResponseDto } from '../dto/update-location-response.dto';
import { LocationDebt } from '../entities/location-debt.entity';
import { generateLocationSlug } from '../utils/location-slug.util';

@Injectable()
export class LocationUpdateService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly locationUpdateRepository: LocationUpdateRepository,
  ) {}

  /**
   * Update basic location fields and royalty/advertisement debts.
   * Does NOT touch availability, payment preferences, RBAC, or walk-in customer.
   */
  async updateLocation(
    locationId: number,
    dto: UpdateLocationRequestDto,
    userId: number,
  ): Promise<UpdateLocationResponseDto> {
    return this.entityManager.transaction(async (manager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId: userId,
        };
      }
      const location = await this.locationUpdateRepository.findLocationById(
        locationId,
        manager,
      );

      if (!location || location.isDeleted) {
        throw new NotFoundException('Location not found');
      }

      const emailNormalized = dto.email.trim().toLowerCase();
      const emailUsedByAnother =
        await this.locationUpdateRepository.isEmailUsedByAnother(
          emailNormalized,
          locationId,
          manager,
        );

      if (emailUsedByAnother) {
        throw new ConflictException('Email already taken');
      }

      // Update basic fields
      location.name = dto.name.trim();
      if (dto.legal_corporate_name != null) {
        location.legalCorporateName = dto.legal_corporate_name.trim() || null;
      }
      location.slug = generateLocationSlug(dto.name);
      location.address = dto.address.trim();
      location.phoneNumber = dto.phone_number.trim();
      location.email = emailNormalized;
      location.cityId = dto.city_id;
      location.provinceId = dto.province_id;
      location.postalCode = dto.postal_code.trim();

      // Country can optionally be updated, but we never touch isDeleted/isEnabledCron here.
      if (dto.country_id != null) {
        location.countryId = dto.country_id;
      }

      // Conversion date + HST registration number
      if (dto.conversionDate) {
        location.conversionDate = new Date(dto.conversionDate);
      }
      if (dto.hst_registration_no != null) {
        location.hstRegistrationNo = dto.hst_registration_no.trim();
      }

      location.updatedByUserId = userId;

      await this.locationUpdateRepository.saveLocation(location, manager);

      // Update royalty and advertisement debts
      const royaltyDebt = await this.locationUpdateRepository.findDebtByType(
        locationId,
        LocationDebt.TYPE_ROYALTY,
        manager,
      );
      const advertisementDebt =
        await this.locationUpdateRepository.findDebtByType(
          locationId,
          LocationDebt.TYPE_ADVERTISEMENT,
          manager,
        );

      if (!royaltyDebt || !advertisementDebt) {
        throw new NotFoundException(
          'Location royalty/advertisement configuration not found',
        );
      }

      royaltyDebt.value = dto.royaltyValue;
      advertisementDebt.value = dto.advertisementValue;

      await this.locationUpdateRepository.saveDebt(royaltyDebt, manager);
      await this.locationUpdateRepository.saveDebt(advertisementDebt, manager);

      return {
        id: location.id,
        slug: location.slug,
        name: location.name,
        email: location.email,
        url: `/admin/v2/${location.slug}/location-view`,
      };
    });
  }
}
