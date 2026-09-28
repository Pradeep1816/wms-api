import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { LocationAvailabilityRepository } from '../repositories/location-availability.repository';
import { LocationAvailabilityTransformationService } from './transformations/location-availability-transformation.service';
import { LocationRenderEventDto, LocationRenderEventsResponseDto } from '../dto/location-availability-response.dto';
import { plainToInstance } from 'class-transformer';
import { PermissionService } from 'src/auth/services/permission.service';
import { LocationAvailability } from '../entities/location-availability.entity';

const dayjs = require('dayjs');

@Injectable()
export class LocationAvailabilityService {
  constructor(
    private readonly locationAvailabilityRepository: LocationAvailabilityRepository,
    private readonly transformationService: LocationAvailabilityTransformationService,
    private readonly permissionService: PermissionService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) { }

  async getRenderEvents(
    locationId: number,
    type: number,
    userId: number,
  ): Promise<LocationRenderEventsResponseDto> {
    try {

      const permission = await this.permissionService.getUserPermissions(userId, locationId);
      if (!permission.includes('manageLocations')) {
        throw new ForbiddenException('You do not have permission to access this resource');
      }
      const referenceDateStr = dayjs().format('YYYY-MM-DD');

      const entities = await this.locationAvailabilityRepository.findByLocationAndType(
        locationId,
        type,
      );

      const events = this.transformationService.toRenderEvents(entities, referenceDateStr);
      return plainToInstance(LocationRenderEventsResponseDto, {
        body: events,
      }, { excludeExtraneousValues: true });
    } catch (error) {
      console.error('Error in LocationAvailabilityService.getRenderEvents:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve location render events: ${error.message}`,
      );
    }
  }

  // Copy Operational Hours (type 1) into Schedule Visibility (type 2) for a location
  async copyAvailabilityFromOperationalHours(
    locationId: number,
    userId: number,
  ): Promise<{ locationId: number }> {
    try {
      const permission = await this.permissionService.getUserPermissions(
        userId,
        locationId,
      );
      if (!permission.includes('manageLocations')) {
        throw new ForbiddenException(
          'You do not have permission to manage location availability',
        );
      }

      await this.entityManager.transaction(async (manager) => {
        // Step A: Remove existing Schedule Visibility rows (type 2)
        await this.locationAvailabilityRepository.deleteByLocationAndType(
          locationId,
          LocationAvailability.TYPE_SCHEDULE_TIME,
          manager,
        );

        // Step B: Load all Operation Time rows (type 1), not deleted
        const operationTimeRows =
          await this.locationAvailabilityRepository.findByLocationAndType(
            locationId,
            LocationAvailability.TYPE_OPERATION_TIME,
            manager,
          );

        // Step C: Copy into Schedule Visibility (type 2)
        const scheduleVisibilityRows: Partial<LocationAvailability>[] =
          operationTimeRows.map((row) => ({
            locationId: row.locationId,
            day: row.day,
            fromTime: row.fromTime,
            toTime: row.toTime,
            type: LocationAvailability.TYPE_SCHEDULE_TIME,
            isDeleted: false,
          }));

        if (scheduleVisibilityRows.length > 0) {
          await this.locationAvailabilityRepository.bulkInsert(
            scheduleVisibilityRows,
            manager,
          );
        }
      });

      return {locationId };
    } catch (error) {
      console.error(
        'Error in LocationAvailabilityService.copyAvailabilityFromOperationalHours:',
        error,
      );
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to copy operational hours to schedule visibility: ${error.message}`,
      );
    }
  }
}
