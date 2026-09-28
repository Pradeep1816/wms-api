import { Controller, Get, Param, Query, Req, ValidationPipe, UseGuards } from "@nestjs/common";
import { Roles } from "src/auth/decorators/roles.decorator";
import { ResponseHelper } from "src/shared/helpers/response.helper";
import { LogHistoryRequestDto, TimelineRequestDto } from "../dto/log-request.dto";
import { LogHistoryResponseDto } from "../dto/log-response.dto";
import { LogService } from "../services/log.service";
import { RolesEnum } from "src/auth/enums/roles.enum";
import { LocationId } from "src/shared/decorators/location-id.decorator";
import { LocationResolveGuard } from "src/shared/guards/location.guard";
import { AuthGuard } from "src/auth/guards/auth.guard";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { TimelineCreatedUsersService } from "../services/timeline-created-users.service";
import { TimelineCreatedUsersResponseDto } from "../dto/timeline-created-users-response.dto";

@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LogController {
  constructor(
    private readonly logService: LogService,
    private readonly timelineCreatedUsersService: TimelineCreatedUsersService,
  ) {}

  @Get('history')
  @Roles(RolesEnum.BACKEND_USER)
  async getHistory(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: LogHistoryRequestDto,
  ): Promise<LogHistoryResponseDto | any> {
    try {
      const result = await this.logService.getLogHistory(
        query.type,
        query.id,
        query.page || 1,
        query.limit || 20,
        locationSlug,
      );
      return ResponseHelper.success(result, 'History retrieved successfully');
    } catch (error) {
      console.error('Error in getHistory controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve history');
    }
  }

  @Get('timeline')
  @Roles(RolesEnum.BACKEND_USER)
  async getTimeline(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: TimelineRequestDto,
  ): Promise<any> {
    try {
      const result = await this.logService.getTimeline(
        locationId,
        locationSlug,
        {
          fromDate: query.fromDate,
          toDate: query.toDate,
          createdUserId: query.createdUserId,
          message: query.message,
        },
        query.page || 1,
        query.limit || 20,
      );
      return ResponseHelper.success(result, 'Timeline retrieved successfully');
    } catch (error) {
      console.error('Error in getTimeline controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve timeline');
    }
  }

  @Get('timeline/created-users')
  @Roles(RolesEnum.BACKEND_USER)
  async getTimelineCreatedUsers(
    @LocationId() locationId: number,
    @Req() req: { user?: { id: number } },
  ): Promise<TimelineCreatedUsersResponseDto | any> {
    try {
      const userId = req.user?.id;
      if (userId == null) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.timelineCreatedUsersService.getCreatedUsersForTimelineDropdown(
        locationId,
        userId,
      );
      
      return ResponseHelper.success(result, 'Timeline created users retrieved successfully');
    } catch (error) {
      console.error('Error in getTimelineCreatedUsers controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve timeline created users');
    }
  }
}