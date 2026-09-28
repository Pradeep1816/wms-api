import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CreateGroupInvoiceRequestDto } from '../dto/create-group-invoice-request.dto';
import { GroupLessonInvoiceService } from '../services/group-lesson-invoice.service';

@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class GroupLessonInvoiceController {
  constructor(
    private readonly groupLessonInvoiceService: GroupLessonInvoiceService,
  ) {}

  @Post('details/:id/group-invoice')
  @Roles(RolesEnum.BACKEND_USER)
  async createGroupLessonInvoice(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) lessonId: number,
    @Body(ValidationPipe) body: CreateGroupInvoiceRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.groupLessonInvoiceService.createGroupLessonInvoice(
        locationId,
        locationSlug,
        lessonId,
        body.enrolmentId,
        currentUser.id,
      );

      if ('alreadyExists' in result) {
        return ResponseHelper.success(
          result,
          result.alreadyExists ? 'Invoice has been created already!' : 'Invoice has been successfully created',
        );
      }

      // TODO(legacy-parity): Legacy MVC action redirects with flash messages (lesson/course pages).
      // API2 intentionally returns JSON for frontend/API consumers.
      return ResponseHelper.success(result, 'Invoice has been successfully created');
    } catch (error) {
      console.error('Error in createGroupLessonInvoice controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create group lesson invoice');
    }
  }
}
