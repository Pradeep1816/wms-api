import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { CreateTeacherConfidentialNoteDto } from '../dto/teacher-confidential-note.dto';
import { TeacherConfidentialNoteService } from '../services/teacher-confidential-note.service';

@Controller('admin/v2/:location/teachers/:id/confidential-notes')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Roles(RolesEnum.OWNER)
export class TeacherConfidentialNoteController {
  constructor(private readonly service: TeacherConfidentialNoteService) {}

  @Get()
  async getNotes(
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
  ) {
    try {
      const result = await this.service.getNotes(locationId, Number(teacherId));

      return ResponseHelper.success(
        result,
        'Confidential notes retrieved successfully',
      );
    } catch (error) {
      console.error('Error retrieving teacher confidential notes:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error
          ? error.message
          : 'Failed to retrieve confidential notes',
      );
    }
  }

  @Post()
  async createNote(
    @LocationId() locationId: number,
    @Param('id') teacherId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(ValidationPipe) body: CreateTeacherConfidentialNoteDto,
  ) {
    try {
      const result = await this.service.createNote(
        locationId,
        Number(teacherId),
        currentUser.id,
        body,
      );

      return ResponseHelper.success(result, 'Confidential note added');
    } catch (error) {
      console.error('Error creating teacher confidential note:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error
          ? error.message
          : 'Failed to add confidential note',
      );
    }
  }
}
