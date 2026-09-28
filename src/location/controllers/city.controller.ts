import { Controller, Get, Query, ValidationPipe, UseGuards, Post, Req, Body, Put, Param, Delete } from '@nestjs/common';
import { CityService } from '../services/city.service';
import { CityRequestDto } from '../dto/city-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { CityResponseDto } from '../dto/city-response.dto';
import { CreateCityRequestDto } from '../dto/create-city-request.dto';
import { CreateCityResponseDto } from '../dto/create-city-response.dto';
import { UpdateCityRequestDto } from '../dto/update-city-request.dto';
import { UpdateCityResponseDto } from '../dto/update-city-response.dto';
import { DeleteCityResponseDto } from '../dto/delete-city-response.dto';

@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Controller('admin/v2/:location')
export class CityController {
  constructor(private readonly cityService: CityService) { }

  @Get('cities')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getCities(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: CityRequestDto,

  ): Promise<CityResponseDto | any> {
    try {
      const data = await this.cityService.getCities(query);
      return ResponseHelper.success(data, 'Cities retrieved successfully');
    } catch (error) {
      console.error('Error fetching cities:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve cities'
      );
    }
  }

  @Post('cities')
  @Roles(RolesEnum.ADMINISTRATOR)
  async createCity(
    @Req() req: any,
    @Body(ValidationPipe) createDto: CreateCityRequestDto,
  ): Promise<CreateCityResponseDto
    | any> {
    try {
      const userId = req.user?.id;

      const result = await this.cityService.createCity(
        userId,
        createDto,
      );

      return ResponseHelper.success(
        result,
        `City created successfully`,
      );

    } catch (error) {
      console.error('Error in createCity controller:', error);

      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (

        error.message.includes('already exists') ||
        error.message.includes('Invalid') ||
        error.message.includes('required')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to create city',
      );
    }
  }

  @Put('cities/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async updateCity(
    @Req() req: any,
    @Param('id') id: number,
    @Body(ValidationPipe) updateDto: UpdateCityRequestDto,
  ): Promise<UpdateCityResponseDto | any> {
    try {
      const userId = req.user?.id;

      const result = await this.cityService.updateCity(
        id,
        userId,
        updateDto,
      );

      return ResponseHelper.success(
        result,
        `City updated successfully`,
      );

    } catch (error) {
      console.error('Error in updateCity controller:', error);

      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message.includes('validation') ||
        error.message.includes('Invalid')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update city',
      );
    }
  }

  @Delete('cities/:id')
  @Roles(RolesEnum.ADMINISTRATOR)
  async deleteCity(
    @Req() req: any,
    @Param('id') id: number,
  ): Promise<DeleteCityResponseDto | any> {
    try {
      const userId = req.user?.id;

      const result = await this.cityService.deleteCity(
        id,
        userId,
      );

      return ResponseHelper.success(
        result,
        `City deleted successfully`,
      );
    } catch (error) {
      console.error('Error in deleteCity controller:', error);

      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message.includes('required') ||
        error.message.includes('validation') ||
        error.message.includes('Invalid')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to delete city',
      );
    }
  }
}
