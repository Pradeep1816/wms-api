import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { UpdateTeacherSignatureDto } from '../dto/update-teacher-signature.dto';
import { TeacherUploadSignatureService } from '../services/teacher-upload-signature.service';

@Controller('user/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherUploadSignatureController {
  constructor(
    private readonly teacherUploadSignatureService: TeacherUploadSignatureService,
  ) {}

  @Patch(':id/signature')
  @Roles(RolesEnum.TEACHER)
  async updateTeacherSignature(
    @LocationId() locationId: number,
    @Param('id') id: number,
    @Body(ValidationPipe) body: UpdateTeacherSignatureDto,
  ) {
    try {
      const result =
        await this.teacherUploadSignatureService.updateTeacherSignature(
          locationId,
          id,
          body,
        );

      return ResponseHelper.success(
        result,
        'Teacher signature updated successfully',
      );
    } catch (error) {
      console.error('Error in updateTeacherUploadSignature controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error
          ? error.message
          : 'Failed to update teacher signature',
      );
    }
  }

  @Get(':id/signature')
  @Roles(RolesEnum.TEACHER)
  async getTeacherSignature(
    @LocationId() locationId: number,
    @Param('id') id: number,
  ) {
    try {
      const result = await this.teacherUploadSignatureService.getTeacherSignature(
        locationId,
        id,
      );

      return ResponseHelper.success(
        result,
        'Teacher signature retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getTeacherUploadSignature controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error
          ? error.message
          : 'Failed to retrieve teacher signature',
      );
    }
  }
}
