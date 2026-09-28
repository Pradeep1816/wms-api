import { Controller, Get, Query, ValidationPipe, UseGuards, Put, Param, Body, Req, Post, Delete } from '@nestjs/common';
import { CountryService } from '../services/country.service';
import { CountryRequestDto } from '../dto/country-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { UpdateCountryRequestDto } from '../dto/update-country-request.dto';
import { UpdateCountryResponseDto } from '../dto/update-country-response.dto';
import { CreateCountryResponseDto } from '../dto/create-country-response.dto';
import { CreateCountryRequestDto } from '../dto/create-country-request.dto';

@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Controller('admin/v2/:location')
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get('countries')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getCountries(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: CountryRequestDto,
  ) {
    try {
      const data = await this.countryService.getCountries(query);
      return ResponseHelper.success(data, 'Countries retrieved successfully');
    } catch (error) {
      console.error('Error fetching countries:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve countries',
      );
    }
  }

@Put('countries/:id')
@Roles(RolesEnum.BACKEND_USER)
async updateCountry(
  @Req() req: any,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateCountryRequestDto,
):Promise<UpdateCountryResponseDto|any> {
  try {
    const userId = req.user?.id;

    const result = await this.countryService.updateCountry(
      id,
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      `Country updated successfully`
    );

  } catch (error) {
    console.error('Error in updateCountry controller:', error);
     if (error.message.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message.includes('already exists') ||
      error.message.includes('required') ||
      error.message.includes('validation') ||
      error.message.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to update country',
    );

  }
}



@Post('countries')
@Roles(RolesEnum.ADMINISTRATOR)
async createCountry(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateCountryRequestDto,
):Promise<CreateCountryResponseDto|any> {
  try {
    const userId = req.user?.id;

    const result = await this.countryService.createCountry(userId, createDto);

    return ResponseHelper.success(result, 'Country created successfully');

  } catch (error) {
    console.error('Error in createCountry controller:', error);

    if (error.message.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message.includes('already exists') ||
      error.message.includes('required') ||
      error.message.includes('validation') ||
      error.message.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create country',
    );
  }
}

@Delete('countries/:id')
@Roles(RolesEnum.ADMINISTRATOR)
async deleteCountry(
  @Req() req: any,
  @Param('id') id: number,
): Promise<any> {
  try {
    const userId = req.user?.id;

    const result = await this.countryService.deleteCountry(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      `Country deleted successfully`,
    );
  } catch (error) {
    console.error('Error in deleteCountry controller:', error);

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
      'Failed to delete country',
    );
  }
}



}





