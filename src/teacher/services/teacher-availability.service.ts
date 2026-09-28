import { BadRequestException, Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { TeacherAvailabilityResponseDto } from '../dto/teacher-availability-response.dto';
import { TeacherAvailabilityRepository } from '../repositories/teacher-availability.repository';
import { TeacherAvailabilityTransformationService } from './transformations/teacher-availability-transformation.service';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { LocationRepository } from '../../location/repositories/location.repository';
import { LocationAvailability } from '../../location/entities/location-availability.entity';
import { ModifyTeacherAvailabilityDto } from '../dto/modify-teacher-availability.dto';
import { plainToInstance } from 'class-transformer';

const dayjs = require('dayjs');
const isoWeek = require('dayjs/plugin/isoWeek');

dayjs.extend(isoWeek);

@Injectable()
export class TeacherAvailabilityService {
  constructor(
    private readonly teacherAvailabilityRepository: TeacherAvailabilityRepository,
    private readonly transformationService: TeacherAvailabilityTransformationService,
    private readonly validationService: CustomerValidationService,
    private readonly locationRepository: LocationRepository,
  ) {}

  /**
   * Calculate Monday-Sunday week range from a given date
   */
  private getWeekRange(date: string): { startDate: string; endDate: string } {
    const targetDate = dayjs(date);
    const monday = targetDate.startOf('isoWeek'); // ISO week starts on Monday
    const sunday = monday.endOf('isoWeek'); // ISO week ends on Sunday
    
    return {
      startDate: monday.format('YYYY-MM-DD'),
      endDate: sunday.format('YYYY-MM-DD'),
    };
  }

  async getTeacherAvailability(
    teacherId: number,
    locationId: number,
    locationSlug: string,
    date?: string,
  ): Promise<TeacherAvailabilityResponseDto> {
    try {
      const isExists = await this.validationService.validateCustomerExists(
        teacherId,
        locationId,
      );
      if (!isExists) {
        throw new BadRequestException(`Teacher with id: ${teacherId} not found in location ${locationSlug}`);
      }

      const targetDate = date || new Date().toISOString().split('T')[0];
      const { startDate, endDate } = this.getWeekRange(targetDate);

      // Fetch teacher availability and location availabilities in parallel
      const [teacherAvailability, locationOperationTime, locationScheduleVisibility] = await Promise.all([
        this.teacherAvailabilityRepository.findByTeacherAndLocation(teacherId, locationId),
        this.locationRepository.findLocationAvailabilitiesByType(
          locationId,
          LocationAvailability.TYPE_OPERATION_TIME,
        ),
        this.locationRepository.findLocationAvailabilitiesByType(
          locationId,
          LocationAvailability.TYPE_SCHEDULE_TIME,
        ),
      ]);

      // Calculate time range from location schedule visibility (same as schedule-events with showAll=false)
      const timeRange = this.transformationService.calculateTimeRangeFromLocationAvailabilities(
        locationScheduleVisibility,
      );

      // Transform to response format
      const response = this.transformationService.transformToResponse(
        teacherAvailability,
        locationOperationTime,
        locationScheduleVisibility,
        startDate,
        endDate,
        teacherId,
        timeRange,
      );

      return plainToInstance(TeacherAvailabilityResponseDto, response);
    } catch (error) {
      console.error('Error in TeacherAvailabilityService:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve teacher availability');
    }
  }

  async modifyTeacherAvailability(
    availabilityId: number,
    teacherId: number,
    locationId: number,
    dto: ModifyTeacherAvailabilityDto,
    userId: number,
  ): Promise<{ success: boolean }> {
    try {
      // Validate teacher exists in location
      const isExists = await this.validationService.validateCustomerExists(
        teacherId,
        locationId,
      );
      if (!isExists) {
        throw new BadRequestException(`Teacher with id: ${teacherId} not found in location`);
      }

      await this.teacherAvailabilityRepository.modifyTeacherAvailability(
        availabilityId,
        teacherId,
        locationId,
        dto,
        userId,
      );

      return { success: true };
    } catch (error) {
      console.error('Error in modifyTeacherAvailability service:', error);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to modify teacher availability');
    }
  }

  async deleteTeacherAvailability(
    availabilityId: number,
    userId: number,
  ): Promise<{ success: boolean }> {
    try {
      await this.teacherAvailabilityRepository.deleteTeacherAvailability(
        availabilityId,
        userId,
      );

      return { success: true };
    } catch (error) {
      console.error('Error in deleteTeacherAvailability service:', error);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to delete teacher availability');
    }
  }
}

