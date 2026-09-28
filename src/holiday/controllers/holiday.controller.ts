import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UnauthorizedException, UseGuards, ValidationPipe } from '@nestjs/common';
import { HolidayService } from '../services/holiday.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { GetHolidaysRequestDto } from '../dto/holiday-request-dto';
import { CreateHolidayRequestDto } from '../dto/create-holiday-request.dto';
import { UpdateHolidayRequestDto } from '../dto/update-holiday-request.dto';

@Controller('admin/v2')
@UseGuards(AuthGuard, RolesGuard)
export class HolidayController {
  constructor(private readonly holidayService: HolidayService) {}

  @Get('holidays')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getAllHolidays(@Query(ValidationPipe) queryParams: GetHolidaysRequestDto) {
    try {
      const data = await this.holidayService.getAllHolidays(queryParams);
      return ResponseHelper.success(data, 'Holiday data retrieved successfully');
    } catch (error) {
      console.error('Error in getAllHolidays controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }

      if (error.message?.includes('database')) {
        return ResponseHelper.error('DATABASE_ERROR', 'Database operation failed');
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve holiday data');
    }
  }
  @Post('holidays')
@Roles(RolesEnum.ADMINISTRATOR)
async createHoliday(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateHolidayRequestDto,
): Promise<any> {
  try {
    const userId = req.user?.id;

        if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.holidayService.createHoliday(
      userId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Holiday created successfully',
    );

  } catch (error) {
    console.error('Error in createHoliday controller:', error);

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
      'Failed to create holiday',
    );
  }
}
@Put('holidays/:id')
@Roles(RolesEnum.ADMINISTRATOR)
async updateHoliday(
  @Req() req: any,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateHolidayRequestDto,
) {
  try {  
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.holidayService.updateHoliday(
      id,
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      'Holiday updated successfully',
    );

  } catch (error) {
    console.error('Error in updateHoliday controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('validation') ||
      error.message?.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to update holiday',
    );
  }
}
@Delete('holidays/:id')
@Roles(RolesEnum.ADMINISTRATOR)
async deleteHoliday(
  @Req() req: any,
  @Param('id') id: number,
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.holidayService.deleteHoliday(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      'Holiday deleted successfully',
    );

  } catch (error) {
    console.error('Error in deleteHoliday controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('validation') ||
      error.message?.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to delete holiday',
    );
  }
}

}


