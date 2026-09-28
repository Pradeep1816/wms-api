import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../entities/location.entity';
import { LocationFlags } from '../entities/location-flags.entity';
import { LocationResponseDto } from '../dto/location-response.dto';
import { LocationDetailsResponseDto } from '../dto/location-details-response.dto';
import { LocationFlagsData, UpdateLocationFlagsDto } from '../dto/location-flags.dto';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { LocationDebt } from '../entities/location-debt.entity';
import { TaxCode } from '../../tax/entities/tax-code.entity';
import { plainToClass } from 'class-transformer';
import { LocationRequestDto } from '../dto/location-list-request.dto';
import { LocationItemResponseDto, LocationListResponseDto } from '../dto/location-list-response.dto';
import { LocationTransformationService } from './transformations/location-transformation.service';
import { LocationRepository } from '../repositories/location.repository';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(LocationFlags)
    private readonly locationFlagsRepository: Repository<LocationFlags>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(LocationDebt)
    private readonly locationDebtRepository: Repository<LocationDebt>,
    @InjectRepository(TaxCode)
    private readonly taxCodeRepository: Repository<TaxCode>,
    private readonly transformService: LocationTransformationService,

    private readonly locationRepositoryCustom: LocationRepository,
    
    

    private readonly cacheService: CacheService,
  ) {}

  private readonly locationCacheTtlSeconds = 1800; // 30 minutes

  async findAll(): Promise<LocationResponseDto[]> {
    try {
      const locations = await this.locationRepository.find({
        where: { isDeleted: false },
        select: { id: true, slug: true, name: true },
        order: { name: 'ASC' },
      });

      return locations.map(location =>
        plainToClass(LocationResponseDto, location, {
          excludeExtraneousValues: true,
        }),
      );
    } catch (error) {
      throw new Error(`Failed to fetch locations: ${error.message}`);
    }
  }

  async getLocationId(locationSlug: string): Promise<number> {
    const normalizedSlug = locationSlug.trim().toLowerCase();
    const cacheKey = this.getLocationCacheKey(normalizedSlug);

    try {
      const cachedId = await this.cacheService.get<number>(cacheKey);
      if (cachedId) {
        return cachedId;
      }

      const location = await this.locationRepository.findOne({
        where: { slug: normalizedSlug, isDeleted: false },
        select: { id: true },
      });

      if (!location) {
        throw new NotFoundException(`Location with slug '${normalizedSlug}' not found`);
      }

      await this.cacheService.set(cacheKey, location.id, this.locationCacheTtlSeconds);
      return location.id;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to get location ID: ${error.message}`);
    }
  }

  async getAllLocationFlags(): Promise<{ [locationSlug: string]: LocationFlagsData }> {
    try {
      // Get all active locations
      const locations = await this.locationRepository.find({
        where: { isDeleted: false },
        select: { slug: true },
      });

      const allFlags: { [locationSlug: string]: LocationFlagsData } = {};

      // Get flags for each location
      for (const location of locations) {
        const flags = await this.getLocationFlags(location.slug);
        allFlags[location.slug] = flags;
      }

      return allFlags;
    } catch (error) {
      throw new Error(`Failed to fetch all location flags: ${error.message}`);
    }
  }

  async getLocationFlags(locationSlug: string): Promise<LocationFlagsData> {
    try {
      // First verify the location exists
      const location = await this.locationRepository.findOne({
        where: { slug: locationSlug, isDeleted: false },
      });

      if (!location) {
        throw new NotFoundException(`Location with slug '${locationSlug}' not found`);
      }

      // Get or create default flags for the location
      let locationFlags = await this.locationFlagsRepository.findOne({
        where: { locationSlug },
      });

      if (!locationFlags) {
        // Create default flags if they don't exist
        locationFlags = this.locationFlagsRepository.create({
          locationSlug,
        });
        await this.locationFlagsRepository.save(locationFlags);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, updatedAt, locationSlug: _, ...flags } = locationFlags;

      return flags;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch location flags: ${error.message}`);
    }
  }

  async updateLocationFlags(locationSlug: string, flagsData: LocationFlagsData): Promise<LocationFlagsData> {
    try {
      // First verify the location exists
      const location = await this.locationRepository.findOne({
        where: { slug: locationSlug, isDeleted: false },
      });

      if (!location) {
        throw new NotFoundException(`Location with slug '${locationSlug}' not found`);
      }

      // Get or create flags for the location
      let locationFlags = await this.locationFlagsRepository.findOne({
        where: { locationSlug },
      });

      if (!locationFlags) {
        locationFlags = this.locationFlagsRepository.create({ locationSlug });
      }

      // Update the flags
      Object.assign(locationFlags, flagsData);
      await this.locationFlagsRepository.save(locationFlags);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, updatedAt, locationSlug: _, ...flags } = locationFlags;

      return flags;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update location flags: ${error.message}`);
    }
  }
  
  async getLocations(
    query: LocationRequestDto,
  ): Promise<LocationItemResponseDto> {
    const { page, limit, sort, order } = query;

    const { items, total } = await this.locationRepositoryCustom.findLocations(
      page,
      limit,
      sort,
      order,
    );

    const body = this.transformService.transformRows(items);

    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    return {
      body,
      pagination,
    };
  }

  async getLocationDetailsBySlug(locationSlug: string): Promise<LocationDetailsResponseDto> {
    try {
      const normalizedSlug = locationSlug.trim().toLowerCase();
      
      const location = await this.locationRepository.findOne({
        where: { slug: normalizedSlug, isDeleted: false },
        relations: ['city', 'province', 'country'],
      });

      if (!location) {
        throw new NotFoundException(`Location with slug '${normalizedSlug}' not found`);
      }

      return plainToClass(LocationDetailsResponseDto, {
        id: location.id,
        name: location.name,
        legalCorporateName: location.legalCorporateName || '',
        address: location.address,
        phoneNumber: location.phoneNumber,
        city: location.city?.name || '',
        province: location.province?.name || '',
        country: location.country?.name || '',
        postalCode: location.postalCode,
        email: location.email || '',
        hstRegistrationNo: location.hstRegistrationNo || '',
      }, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to get location details: ${error.message}`);
    }
  }

  private getLocationCacheKey(slug: string): string {
    return `location:slug:${slug}`;
  }
}
