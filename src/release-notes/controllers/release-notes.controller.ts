import {BadRequestException, Body, Controller,Delete,Get,Param,Post,Put,Query,Req,UnauthorizedException,UseGuards,ValidationPipe} from '@nestjs/common';
import { ReleaseNotesService } from '../services/release-notes.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { GetReleaseNotesRequestDto } from '../dto/release-notes-request.dto';
import { CreateReleaseNoteRequestDto } from '../dto/create-release-notes-request.dto';
import { CreateReleaseNoteResponseDto } from '../dto/create-release-notes-response.dto';
import { UpdateReleaseNoteRequestDto } from '../dto/update-release-notes-request.dto';
import { PopupOkRequestDto } from '../dto/popup-ok-request.dto';
import { UpdateReadNotesRequestDto } from '../dto/update-read-notes-request.dto';



@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Controller('admin/v2/:location')
export class ReleaseNotesController {
  constructor(private readonly releaseNotesService: ReleaseNotesService) {}

  @Get('release-notes')
@Roles(RolesEnum.BACKEND_USER)
async getReleaseNotes(
  @Req() req: any,
  @LocationId() locationId: number,
  @Query(ValidationPipe) query: GetReleaseNotesRequestDto,
) {
  try {
    const { page = 1, limit = 10, sortBy = 'id', sortDir = 'desc' } = query;
    const userRoles = req.user?.roles || [];
    // Check if user is admin (administrator role)
    const isAdmin = userRoles.includes(RolesEnum.ADMINISTRATOR);

    const data = await this.releaseNotesService.getReleaseNotes(
      page, 
      limit, 
      isAdmin,
      sortBy,
      sortDir,
    );

    return ResponseHelper.success(data, 'Release notes retrieved successfully');
  } catch (error) {
    console.error('Error in getReleaseNotes:', error);
    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to retrieve release notes',
    );
  }
}
@Post('release-notes')
@Roles(RolesEnum.BACKEND_USER)
async createReleaseNote(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateReleaseNoteRequestDto,
): Promise<CreateReleaseNoteResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.releaseNotesService.createReleaseNote(
      userId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Release note created successfully',
    );

  } catch (error) {
    console.error('Error in createReleaseNote controller:', error);

    if (error instanceof BadRequestException) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    if (error.message && error.message.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create release note',
    );
  }
}

@Put('release-notes/:id')
@Roles(RolesEnum.BACKEND_USER)
async updateReleaseNote(
  @Req() req: any,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateReleaseNoteRequestDto,
) {
  try {
    const userId = req.user?.id;

      if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }


    const result = await this.releaseNotesService.updateReleaseNote(
      id,
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      'Release note updated successfully',
    );

  } catch (error) {
    console.error('Error in updateReleaseNote controller:', error);

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
      'Failed to update release note',
    );
  }
}
@Delete('release-notes/:id')
@Roles(RolesEnum.BACKEND_USER)
async deleteReleaseNote(
  @Req() req: any,
  @Param('id') id: number,
) {
  try {
    const userId = req.user?.id;

    
      if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.releaseNotesService.deleteReleaseNote(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      'Release note deleted successfully',
    );

  } catch (error) {
    console.error('Error in deleteReleaseNote controller:', error);

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
      'Failed to delete release note',
    );
  }
}

  /**
   * Get latest unread release note for popup on login
   * Matches legacy actionRead() behavior
   */
  @Get('release-notes/read/:userId')
  @Roles(RolesEnum.BACKEND_USER)
  async getLatestUnreadNote(@Param('userId') userId: number) {
    try {
      const latestNote = await this.releaseNotesService.getLatestUnreadNote(userId);

      if (!latestNote) {
        return ResponseHelper.success(null, 'No unread release notes');
      }

      return ResponseHelper.success(latestNote, 'Latest unread note retrieved successfully');
    } catch (error) {
      console.error('Error in getLatestUnreadNote controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to get latest unread note',
      );
    }
  }

  /**
   * Update read status for popup ok action
   * Matches legacy actionPopupOk() behavior
   */
  @Post('release-notes/popup-ok')
  @Roles(RolesEnum.BACKEND_USER)
  async updateReadStatusForPopup(
    @Req() req: any,
    @Body(ValidationPipe) body: PopupOkRequestDto,
  ) {
    try {
      const { userId, isRead } = body;

      if (!userId) {
        return ResponseHelper.error('BAD_REQUEST', 'User ID is required');
      }

      await this.releaseNotesService.updateReadStatusForPopup(userId, isRead);

      return ResponseHelper.success(
        { success: true },
        'Read status updated successfully',
      );
    } catch (error) {
      console.error('Error in updateReadStatusForPopup controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update read status',
      );
    }
  }

  /**
   * Update read status for a specific release note
   * Matches legacy actionUpdateReadNotes() behavior
   */
  @Post('release-notes/update-read-notes')
  @Roles(RolesEnum.BACKEND_USER)
  async updateReadStatusForNote(
    @Req() req: any,
    @Body(ValidationPipe) body: UpdateReadNotesRequestDto,
  ) {
    try {
      const userId = req.user?.id;
      const { id: releaseNoteId } = body;

      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      if (!releaseNoteId) {
        return ResponseHelper.error('BAD_REQUEST', 'Release note ID is required');
      }

      await this.releaseNotesService.updateReadStatusForNote(releaseNoteId, userId);

      return ResponseHelper.success(
        { success: true },
        'Read status updated successfully',
      );
    } catch (error) {
      console.error('Error in updateReadStatusForNote controller:', error);

      if (error instanceof UnauthorizedException) {
        return ResponseHelper.error('UNAUTHORIZED', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update read status',
      );
    }
  }
}
