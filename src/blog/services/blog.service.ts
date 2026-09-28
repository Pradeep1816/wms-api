import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BlogRepository } from '../repositories/blog.repository';
import { GetBlogsRequestDto } from '../dto/blog-request.dto';
import { plainToInstance } from 'class-transformer';
import { BlogListResponseDto } from '../dto/blog-response.dto';
import { formatDate } from '../../utils/date-utils';
import { DeleteBlogResponseDto } from '../dto/delete-blog-response.dto';
import { UpdateBlogRequestDto } from '../dto/update-blog-request.dto';
import { UpdateBlogResponseDto } from '../dto/update-blog-response.dto';
import { CreateBlogRequestDto } from '../dto/create-blog-request.dto';
import { CreateBlogResponseDto } from '../dto/create-blog-response.dto';

@Injectable()
export class BlogService {
  constructor(private readonly blogRepository: BlogRepository) {}

  async getAllBlogs(queryParams: GetBlogsRequestDto) {
    const { page, limit, sort,order  } = queryParams;

  const { blogs, total } = await this.blogRepository.getPaginatedBlogs(
    page,
    limit,
    sort,
    order,
  );

    const mapped = blogs.map(b => ({
    id: b.id,
    userId: b.user?.id,
    userName: b.user?.profile
    ? `${b.user.profile.firstname} ${b.user.profile.lastname}`
    : '',
      title: b.title,
      content: b.content,
      date: formatDate(b.date), 
    }));

    return plainToInstance(
      BlogListResponseDto,
      {
        body: mapped,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { excludeExtraneousValues: true },
    );
  }

  async deleteBlog(blogId: number, userId: number): Promise<any> {
    try {
      const blog = await this.blogRepository.findBlogById(blogId);

      if (!blog) {
        throw new NotFoundException(`Blog with ID ${blogId} not found`);
      }

      const deletedBlog = await this.blogRepository.deleteBlog(blogId, userId);

      const responseDto = plainToInstance(
        DeleteBlogResponseDto,
        deletedBlog,
        { excludeExtraneousValues: true }
      );

      return responseDto;
    } catch (error) {
      console.error('Error in deleteBlog service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to delete blog: ${error.message}`);
    }
  }

  async updateBlog(blogId: number, userId: number, updateDto: UpdateBlogRequestDto): Promise<UpdateBlogResponseDto> {
    try {
      if (!updateDto.title && !updateDto.content) {
        throw new BadRequestException('Nothing to update');
      }

      const updatedBlog = await this.blogRepository.updateBlog(blogId, userId, updateDto);

      if (!updatedBlog) {
        throw new NotFoundException('Blog not found');
      }

      const response: UpdateBlogResponseDto = {
        id: updatedBlog.id,
        title: updatedBlog.title,
        content: updatedBlog.content,
        date: formatDate(updatedBlog.date),
        updatedByUserId: updatedBlog.updatedByUserId,
      };

      return response;
    } catch (error) {
      console.error('Error in updateBlog service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to update blog');
    }
  }

  async createBlog(
  userId: number,
  createDto: CreateBlogRequestDto,
): Promise<CreateBlogResponseDto> {
  try {

    const blog = await this.blogRepository.createBlog(createDto, userId);


    const response = plainToInstance(CreateBlogResponseDto, blog, {
      excludeExtraneousValues: true,
    });

 
    response.createdOn = formatDate(blog.date);


    response.createdByUserId = blog.userId;

    return response;

  } catch (error) {
    console.error('Error in createBlog service:', error);

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Failed to create blog');
  }
}
}