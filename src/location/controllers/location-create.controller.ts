import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
  Req,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CreateLocationRequestDto } from '../dto/create-location-request.dto';
import { LocationCreateService } from '../services/location-create.service';

/**
 * Create location API.
 * POST /admin/v2/location/create
 * Headers: Authorization: Bearer <token>, Content-Type: application/json
 * Allowed: administrator, admin, superadmin (validated in service).
 */
@Controller('admin/v2/location')
@UseGuards(AuthGuard, RolesGuard)
export class LocationCreateController {
  private readonly logger = new Logger(LocationCreateController.name);

  constructor(private readonly locationCreateService: LocationCreateService) {}

  @Post('create')
  @Roles(RolesEnum.ADMINISTRATOR)
  async createLocation(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateLocationRequestDto,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const data = await this.locationCreateService.createLocation(dto, userId);
      return ResponseHelper.success(data, 'Location created successfully');
    } catch (error) {
        console.error('Error creating location:', error);
        throw error;
    }
  }
}
