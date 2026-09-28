import {
  Controller,
  Post,
  Param,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ApiResponse } from '../../shared/interceptors/response.interceptor';
import { UserImportService } from '../services/user-import.service';
import { UserImportResponseDto } from '../dto/user-import-response.dto';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { RolesEnum } from '../../auth/enums/roles.enum';

/** Multer file shape when using memory storage (buffer + originalname). */
interface UploadedFileDto {
  buffer?: Buffer;
  originalname?: string;
}

@Controller('admin/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserImportController {
  constructor(private readonly userImportService: UserImportService) {}

  /**
   * Import users (customers) and students from a CSV file.
   * CSV format must match legacy (see docs/user-import-sample.csv).
   */
  @Post('import')
  @Roles(RolesEnum.BACKEND_USER)
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @Param('location') locationSlug: string,
    @UploadedFile() file: UploadedFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<UserImportResponseDto> | any> {
    if (!file?.buffer) {
      throw new BadRequestException('CSV file is required');
    }
    const ext = (file.originalname || '').toLowerCase();
    if (!ext.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }
    try {
      const result = await this.userImportService.importFromCsv(
        locationSlug,
        file.buffer,
        user.id,
      );
      return ResponseHelper.success(result, 'User data imported successfully');
    } catch (error) {
      console.error('Error in user import controller:', error);
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error?.message && String(error.message).includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to import users from CSV',
      );
    }
  }
}
