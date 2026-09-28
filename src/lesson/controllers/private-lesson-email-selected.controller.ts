import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { PrivateLessonEmailSelectedRequestDto, PrivateLessonEmailSelectedSendRequestDto } from '../dto/private-lesson-action-dto/private-lesson-email-selected-request.dto';
import { PrivateLessonEmailSelectedService } from '../services/private-lesson-actions/private-lesson-email-selected.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/services/auth.service';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonEmailSelectedController {
  constructor(
    private readonly privateLessonEmailSelectedService: PrivateLessonEmailSelectedService,
  ) {}

  /**
   * Get email multi customer (to, subject) for selected private lessons.
   * GET supports: ?lessonIds=4369820 | ?lessonIds=4369820,4369821 | ?lessonIds=[4369820]
   * Legacy: ?EmailMultiCustomer[lessonIds][]=4369820
   */
  @Get('email-multi-customer')
  @Roles(RolesEnum.BACKEND_USER)
  async getEmailMultiCustomerByQuery(
    @Req() req: any,
    @LocationId() locationId: number,
    @Query(ValidationPipe) dto: PrivateLessonEmailSelectedRequestDto,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

     

      const result =
        await this.privateLessonEmailSelectedService.getEmailMultiCustomer(
          locationId,
          dto,
        );

      return ResponseHelper.success(result, 'Email multi customer retrieved successfully');
    } catch (error) {
      console.error('Error in getEmailMultiCustomer controller:', error);
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message);
    }
  }

  /**
   * Send bulk email to selected private lesson customers.
   */

  @Post('email-multi-customer/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(RolesEnum.BACKEND_USER)
  async sendEmailMultiCustomer(
    @Req() req: any,
    @LocationId() locationId: number,
    @Body(ValidationPipe) dto: PrivateLessonEmailSelectedSendRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const result = await this.privateLessonEmailSelectedService.sendEmailMultiCustomer(
        locationId,
        dto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Bulk email queued successfully');
    } catch (error) {
      console.error('Error in sendEmailMultiCustomer controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message);
    }
  }

}
