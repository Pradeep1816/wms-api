import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { CreateLocationRequestDto } from '../dto/create-location-request.dto';
import { CreateLocationResponseDto } from '../dto/create-location-response.dto';
import { LocationCreateRepository, LocationRowInsert } from '../repositories/location-create-repositories/location-create.repository';
import { LocationCreateAvailabilityRepository } from '../repositories/location-create-repositories/location-create-availability.repository';
import { LocationCreateDebtRepository } from '../repositories/location-create-repositories/location-create-debt.repository';
import { LocationCreatePaymentPreferenceRepository } from '../repositories/location-create-repositories/location-create-payment-preference.repository';
import { LocationCreateRbacRepository } from '../repositories/location-create-repositories/location-create-rbac.repository';
import { LocationCreateWalkinCustomerRepository } from '../repositories/location-create-repositories/location-create-walkin-customer.repository';
import { generateLocationSlug } from '../utils/location-slug.util';

  /**
   * Single service for location create flow (Steps 1–7).
   * All database operations are in repositories; this service orchestrates and uses only repos.
   */
  @Injectable()
  export class LocationCreateService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly locationCreateRepository: LocationCreateRepository,
    private readonly locationCreateAvailabilityRepository: LocationCreateAvailabilityRepository,
    private readonly locationCreateDebtRepository: LocationCreateDebtRepository,
    private readonly locationCreatePaymentPreferenceRepository: LocationCreatePaymentPreferenceRepository,
    private readonly locationCreateRbacRepository: LocationCreateRbacRepository,
    private readonly locationCreateWalkinCustomerRepository: LocationCreateWalkinCustomerRepository,
  ) {}

  /**
   * Step 1: Prepare location row (slug, defaults). Step 2 uses repo to insert.
   */
  private prepareLocationRow(
    dto: CreateLocationRequestDto,
    userId: number,
  ): LocationRowInsert {
    const slug = generateLocationSlug(dto.name);
    const countryId = dto.country_id ?? 1; // default country id is 1
    const conversionDate = dto.conversionDate ? new Date(dto.conversionDate) : undefined;
    const emailNormalized = dto.email.trim().toLowerCase();

    return {
      name: dto.name.trim(),
      legalCorporateName: dto.legal_corporate_name?.trim() || null,
      address: dto.address.trim(),
      phoneNumber: dto.phone_number.trim(),
      email: emailNormalized,
      cityId: dto.city_id,
      provinceId: dto.province_id,
      postalCode: dto.postal_code.trim(),
      countryId,
      slug,
      conversionDate,
      isDeleted: false,
      createdByUserId: userId,
      updatedByUserId: userId,
      isEnabledCron: false,
    };
  }

  async createLocation(
    dto: CreateLocationRequestDto,
    userId: number,
  ): Promise<CreateLocationResponseDto> {
    
    return this.entityManager.transaction(async (manager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId: userId,
        };
      }
      // Step 1: Validate (email not already used) and prepare row
      const emailNormalized = dto.email.trim().toLowerCase();
      const emailUsed = await this.locationCreateRepository.isEmailUsed(emailNormalized, manager);
      if (emailUsed) {
        throw new ConflictException('Email already taken');
      }
      const locationRow = this.prepareLocationRow(dto, userId);

      // Step 2: Insert location (get new id)
      const location = await this.locationCreateRepository.insertLocation(locationRow, manager);
      const locationId = location.id;

      // Step 3: Default availability (14 rows)
      await this.locationCreateAvailabilityRepository.insertDefaultAvailability(locationId, manager);

      // Step 4: Royalty and advertisement (location debt)
      await this.locationCreateDebtRepository.insertRoyaltyAndAdvertisement(
        locationId,
        dto.royaltyValue,
        dto.advertisementValue,
        manager,
      );

      // Step 5: Payment preference
      await this.locationCreatePaymentPreferenceRepository.insertOne(
        locationId,
        userId,
        manager,
      );

      // Step 6: RBAC permissions for this location
      await this.locationCreateRbacRepository.addPermissionsForLocation(locationId, manager);

      // Step 7: Walk-in customer and link to location
      await this.locationCreateWalkinCustomerRepository.insertWalkinCustomer(
        locationId,
        userId,
        manager,
      );

      return plainToClass(
        CreateLocationResponseDto,
        {
          id: location.id,
          slug: location.slug,
          name: location.name,
          email: location.email,
          url: `/admin/v2/${location.slug}/locations/${location.id}`,
        },
        { excludeExtraneousValues: true },
      );
    });
  }
}
