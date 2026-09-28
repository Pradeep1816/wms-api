import { Controller, Get, Post, Param, Query, Body, UseGuards, ValidationPipe, Req, ParseIntPipe, BadRequestException } from "@nestjs/common";
import { ResponseHelper } from "src/shared/helpers/response.helper";
import { CommentsResponseDto } from "../dto/comment-response.dto";
import { CommentService } from "../services/comment.service";
import { CommentRequestDto, CommentsRequestDto, CreateCommentRequestDto } from "../dto/comment-request.dto";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { AuthGuard } from "src/auth/guards/auth.guard";
import { LocationResolveGuard } from "src/shared/guards/location.guard";
import { Roles } from "src/auth/decorators/roles.decorator";
import { RolesEnum } from "src/auth/enums/roles.enum";
import { LocationId } from "src/shared/decorators/location-id.decorator";


@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get('comments')
  @Roles(RolesEnum.BACKEND_USER)
  async getComments(@LocationId() locationId: number, @Query(ValidationPipe) query: CommentRequestDto): Promise<CommentsResponseDto | any> {
    try {
      const result = await this.commentService.getNotes(query);
      return ResponseHelper.success(result, 'Notes retrieved successfully',);
    } catch (error) {
      console.error('Error in getNotes controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve notes');
    }
  }

  /**
   * Create a new comment
   */
  @Post('comments')
  @Roles(RolesEnum.BACKEND_USER)
  async createComment(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Query('instanceId', ParseIntPipe) instanceId: number,
    @Query('instanceType', ParseIntPipe) instanceType: number,
    @Body(ValidationPipe) createDto: CreateCommentRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;

      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      // Validate content is provided
      if (!createDto.content || !createDto.content.trim()) {
        return ResponseHelper.error('BAD_REQUEST', 'Content is required');
      }

      const result = await this.commentService.createNote(
        instanceId,
        instanceType,
        createDto.content.trim(),
        loggedUserId,
      );

      // Return response matching legacy format
      // Legacy returns HTML data, but we return the comments list in JSON format
      return ResponseHelper.success(
        {
          status: true,
          data: result.comments, // Return comments data instead of HTML
        },
        'Note created successfully'
      );
    } catch (error) {
      console.error('Error in createNote controller:', error);
      if (error.message && error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message && (error.message.includes('validation') || error.message.includes('required'))) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to create note');
    }
  }
}