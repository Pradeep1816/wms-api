import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { LocationAvailabilityEditRepository } from '../repositories/location-availability-edit.repository';
import { PermissionService } from 'src/auth/services/permission.service';
import { LocationAvailabilityEditDto } from '../dto/location-availability.request.dto';

@Injectable()
export class LocationAvailabilityEditService {
  constructor(
    private readonly locationAvailabilityEditRepository: LocationAvailabilityEditRepository,
  ) {}

  async addAvailability(
    locationId: number,
    dto: LocationAvailabilityEditDto,
  ): Promise<{ status: boolean }> {
    const existing =
      await this.locationAvailabilityEditRepository.findAvailabilityByDayType(
        locationId,
        dto.resourceId,
        dto.type,
      );
    if (existing) {
      throw new BadRequestException('Availability cannot be overlapped.');
    }

    const { fromTime, toTime } = this.parseTimes(dto.startTime, dto.endTime);

    await this.locationAvailabilityEditRepository.createAvailability(
      locationId,
      dto.resourceId,
      dto.type,
      fromTime,
      toTime,
    );

    return { status: true };
  }

  async editAvailability(
    locationId: number,
    resourceId: number,
    type: number,
    startTime: string,
    endTime: string,
  ): Promise<any> {
    
    const availability =
      await this.locationAvailabilityEditRepository.findAvailabilityByDayType(
        locationId,
        resourceId,
        type,
      );
    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    const { fromTime, toTime } = this.parseTimes(startTime, endTime);
    return await this.locationAvailabilityEditRepository.updateAvailability(
      availability.id,
      fromTime,
      toTime,
    );
  }

  async deleteAvailability(
    locationId: number,
    id: number,
  ): Promise<any> {
    
    const availability =
      await this.locationAvailabilityEditRepository.findAvailabilityByIdAndLocation(
        id,
        locationId,
      );
    if (!availability) {
      throw new NotFoundException('Availability not found');
    }
      await this.locationAvailabilityEditRepository.deleteAvailability(id);
    return { id };
  }

  private parseTimes(
    startTime: string,
    endTime: string,
  ): { fromTime: string; toTime: string } {
    const fromTime = startTime.split(' ')[1] ?? startTime;
    const toTime = endTime.split(' ')[1] ?? endTime;

    const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!fromTime || !toTime || !timeRegex.test(fromTime) || !timeRegex.test(toTime)) {
      throw new BadRequestException('Invalid startTime or endTime format');
    }

    if (toTime <= fromTime) {
      throw new BadRequestException(
        'To Time should be greater than From Time',
      );
    }
    return { fromTime, toTime };
  }
}
