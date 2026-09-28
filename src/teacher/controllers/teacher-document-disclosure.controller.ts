import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { UpdateTeacherDocumentDisclosureDto } from '../dto/teacher-document-disclosure.dto';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';
import { TeacherDocumentDisclosureService } from '../services/teacher-document-disclosure.service';

@Controller('admin/v2/:location/teacher-document-disclosures')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Roles(RolesEnum.BACKEND_USER)
export class TeacherDocumentDisclosureController {
  constructor(private readonly service: TeacherDocumentDisclosureService) {}

  @Get()
  async getDisclosures() {
    try {
      const result = await this.service.getDisclosures();

      return ResponseHelper.success(
        result,
        'Teacher document disclosures retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving teacher document disclosures:', error);

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error
          ? error.message
          : 'Failed to retrieve teacher document disclosures',
      );
    }
  }

  @Patch(':documentType')
  async updateDisclosure(
    @Param('documentType') documentType: TeacherDocumentSignatureRequestType,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) body: UpdateTeacherDocumentDisclosureDto,
  ) {
    try {
      const result = await this.service.updateDisclosure(
        documentType,
        currentUser.id,
        body,
      );

      return ResponseHelper.success(result, 'Disclosure updated successfully');
    } catch (error) {
      console.error('Error updating teacher document disclosure:', error);

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error
          ? error.message
          : 'Failed to update teacher document disclosure',
      );
    }
  }
}
