import { Controller, Get, Query, ValidationPipe, UseGuards, Post, Req, Body, Put, Param, Delete } from '@nestjs/common';
import { ProvinceService } from '../services/province.service';
import { ProvinceRequestDto } from '../dto/province-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { ProvinceResponseDto } from '../dto/province-response.dto';
import { CreateProvinceRequestDto } from '../dto/create-province-request.dto';
import { CreateProvinceResponseDto } from '../dto/create-province-response.dto';
import { UpdateProvinceRequestDto } from '../dto/update-province-request.dto';
import { UpdateProvinceResponseDto } from '../dto/update-province-response.dto';
import { DeleteProvinceResponseDto } from '../dto/delete-province-response.dto';

@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Controller('admin/v2/:location')
export class ProvinceController {
  constructor(private readonly provinceService: ProvinceService) {}

  @Get('provinces')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getProvinces(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: ProvinceRequestDto,
  ): Promise<ProvinceResponseDto | any> {
    try {
      const data = await this.provinceService.getProvinces(query);
      return ResponseHelper.success(data, 'Provinces retrieved successfully');
    } catch (error) {
      console.error('Error fetching provinces:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve provinces'
      );
    }
  }


@Post('provinces')
@Roles(RolesEnum.ADMINISTRATOR)
async createProvince(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateProvinceRequestDto,
): Promise<CreateProvinceResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.provinceService.createProvince(
      userId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Province created successfully',
    );

  } catch (error) {
    console.error('Error in createProvince controller:', error);


    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('required') ||
      error.message?.includes('Invalid') ||
      error.message?.includes('already exists')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create province',
    );
  }
}
@Put('provinces/:id')
@Roles(RolesEnum.BACKEND_USER)
async updateProvince(
  @Req() req: any,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateProvinceRequestDto,
): Promise<UpdateProvinceResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.provinceService.updateProvince(
      id,
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      `Province updated successfully`,
    );

  } catch (error) {
    console.error('Error in updateProvince controller:', error);

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
      'Failed to update province',
    );
  }
}
@Delete('provinces/:id')
@Roles(RolesEnum.ADMINISTRATOR)
async deleteProvince(
  @Req() req: any,
  @Param('id') id: number,
): Promise<DeleteProvinceResponseDto|any> {
  try {
    const userId = req.user?.id;

    const result = await this.provinceService.deleteProvince(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      `Province deleted successfully`,
    );

  } catch (error) {
    console.error('Error in deleteProvince controller:', error);

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
      'Failed to delete province',
    );
  }
}

}
