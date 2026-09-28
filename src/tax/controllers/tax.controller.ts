import { Controller, Get, Query, ValidationPipe, UseGuards, Post, Req, Body, Put, Param, Delete } from '@nestjs/common';
import { TaxService } from '../services/tax.service';
import { TaxCodeRequestDto } from '../dto/tax-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { CreateTaxCodeRequestDto } from '../dto/create-tax-request.dto';
import { CreateTaxCodeResponseDto } from '../dto/create-tax-response.dto';
import { UpdateTaxCodeRequestDto } from '../dto/update-tax-request.dto';
import { UpdateTaxCodeResponseDto } from '../dto/update-tax-response.dto';
import { DeleteTaxCodeResponseDto } from '../dto/delete-tax-response.dto';


@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Controller('admin/v2/:location')
export class TaxCodeController {
  constructor(private readonly taxService: TaxService) {}

  @Get('tax-codes')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getTaxCodes(

    @Query(ValidationPipe) query: TaxCodeRequestDto,
  ) {
    try {
      const data = await this.taxService.getTaxCodes(query);
      return ResponseHelper.success(data, 'Tax Codes retrieved successfully');
    } catch (error) {
      console.error('Error fetching tax codes:', error);

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve tax codes',
      );
    }
  }


@Post('tax-codes')
@Roles(RolesEnum.ADMINISTRATOR)
async createTaxCode(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateTaxCodeRequestDto,
): Promise<CreateTaxCodeResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.taxService.createTaxCode(
      userId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Tax code created successfully',
    );

  } catch (error) {
    console.error('Error in createTaxCode controller:', error);

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
      'Failed to create tax code',
    );
  }

}

@Put('tax-codes/:id')
@Roles(RolesEnum.BACKEND_USER)
async updateTaxCode(
  @Req() req: any,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateTaxCodeRequestDto,
): Promise<UpdateTaxCodeResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.taxService.updateTaxCode(
      id,
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      `Tax code updated successfully`,
    );

  } catch (error) {
    console.error('Error in updateTaxCode controller:', error);

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
      'Failed to update tax code',
    );
  }
}
@Delete('tax-codes/:id')
@Roles(RolesEnum.ADMINISTRATOR)
async deleteTaxCode(
  @Req() req: any,
  @Param('id') id: number,
): Promise<DeleteTaxCodeResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.taxService.deleteTaxCode(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      `Tax code deleted successfully`,
    );

  } catch (error) {
    console.error('Error in deleteTaxCode controller:', error);

  
    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('required') ||
      error.message?.includes('validation') ||
      error.message?.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

 
    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to delete tax code',
    );
  }
}


}
