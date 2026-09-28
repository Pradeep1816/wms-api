import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { BlogService } from '../services/blog.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { GetBlogsRequestDto } from '../dto/blog-request.dto';
import { DeleteBlogResponseDto } from '../dto/delete-blog-response.dto';
import { UpdateBlogRequestDto } from '../dto/update-blog-request.dto';
import { CreateBlogRequestDto } from '../dto/create-blog-request.dto';
import { CreateBlogResponseDto } from '../dto/create-blog-response.dto';

@Controller('admin/v2') 
@UseGuards(AuthGuard, RolesGuard) 
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get('blogs')
  @Roles(RolesEnum.ADMINISTRATOR,RolesEnum.STAFFMEMBER,RolesEnum.OWNER)
  async getAllBlogs(@Query(ValidationPipe) queryParams: GetBlogsRequestDto) {
    try {
      const data = await this.blogService.getAllBlogs(queryParams);
      return ResponseHelper.success(data, 'Blogs data retrieved successfully');
    } catch (error) {
      console.error('Error in getAllBlogs controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('validation')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }

      if (error.message?.includes('database')) {
        return ResponseHelper.error('DATABASE_ERROR', 'Database operation failed');
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve blogs data');
    }
  }

  @Delete('blogs/:id')
  @Roles(RolesEnum.ADMINISTRATOR)
  async deleteBlog(
    @Req() req: any,
    @Param('id') blogId: number,
  ): Promise<DeleteBlogResponseDto | any> {
    try {
      const userId = req.user?.id;
      const deletedBlog = await this.blogService.deleteBlog(blogId, userId);
      return ResponseHelper.success(deletedBlog, 'Blog deleted successfully');
    } catch (error) {
      console.error('Error in deleteBlog controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message?.includes('Unable to delete') ||
        error.message?.includes('invalid')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to delete blog',
      );
    }
  }

  @Put('blogs/:id')
  @Roles(RolesEnum.ADMINISTRATOR)
  async updateBlog(
    @Req() req: any,
    @Param('id') blogId: number,
    @Body(ValidationPipe) updateDto: UpdateBlogRequestDto,
  ) {
    try {
      const userId = req.user?.id;
      const result = await this.blogService.updateBlog(blogId, userId, updateDto);
      return ResponseHelper.success(result, 'Blog updated successfully');
    } catch (error) {
      console.error('Error in updateBlog controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('Nothing to update') || error.message?.includes('required')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update blog',
      );
    }
  }
 @Post('blogs')
@Roles(RolesEnum.ADMINISTRATOR)
async createBlog(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateBlogRequestDto,
): Promise<CreateBlogResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.blogService.createBlog(userId, createDto);

    return ResponseHelper.success(result, 'Blog created successfully');
  } catch (error) {
    console.error('Error in createBlog controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('already exists') ||
      error.message?.includes('required') ||
      error.message?.includes('validation') ||
      error.message?.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create blog',
    );
  }
}


  


}
