import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Blog } from '../entities/blog.entity';
import { UpdateBlogRequestDto } from '../dto/update-blog-request.dto';
import { CreateBlogRequestDto } from '../dto/create-blog-request.dto';
import { getCurrentESTDate } from '../../utils/date-utils';


@Injectable()
export class BlogRepository {
  constructor(
    @InjectRepository(Blog)
    private readonly blogRepository: Repository<Blog>,
  ) { }

 // Find Blogs
  async findBlogById(blogId: number): Promise<Blog | null> {
    return await this.blogRepository.findOne({
      where: { id: blogId, isDeleted: false },
    });
  }


  // Get Blogs
  async getPaginatedBlogs(page: number, limit: number,
    sort: string = 'date',
    order: 'ASC' | 'DESC' = 'DESC') {
    const skip = (page - 1) * limit;

    try {
      const [blogs, total] = await this.blogRepository.findAndCount({
        where: { isDeleted: false },
        order: { [sort]: order },
        skip,
        take: limit,
        relations: ['user', 'user.profile'],
      });
    
      return { blogs, total };
    } catch (error) {
      console.error(' Database Error in BlogRepository.getPaginatedBlogs:', error.message);
      throw new Error('DATABASE_ERROR');
    }
  }

  // Delete Blogs
  async deleteBlog(blogId: number, userId: number): Promise<Blog> {
    const blog = await this.blogRepository.findOne({
      where: { id: blogId, isDeleted: false }
    });

    if (!blog) {
      throw new Error(`Blog with ID ${blogId} not found`);
    }

    blog.isDeleted = true;
    blog.updatedOn = getCurrentESTDate();
    blog.updatedByUserId = userId;

    const deletedBlog = await this.blogRepository.save(blog);

    return deletedBlog;
  }

  // Update Blogs 
  async updateBlog(blogId: number, userId: number, updateDto: UpdateBlogRequestDto): Promise<Blog> {
    const queryRunner = this.blogRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const blog = await queryRunner.manager.findOne(Blog, {
        where: { id: blogId, isDeleted: false },
      });

      if (!blog) {
        throw new Error('Blog not found');
      }

      if (updateDto.title !== undefined) {
        blog.title = updateDto.title;
      }

      if (updateDto.content !== undefined) {
        blog.content = updateDto.content;
      }

      blog.updatedOn = getCurrentESTDate();
      blog.updatedByUserId = userId;

      const updatedBlog = await queryRunner.manager.save(Blog, blog);

      await queryRunner.commitTransaction();

      return updatedBlog;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Create Blogs
  async createBlog(createDto: CreateBlogRequestDto, userId: number) {
    const queryRunner = this.blogRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { title, content } = createDto;

      const createdOn = getCurrentESTDate();

      const insertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Blog)
        .values({
          title,
          content,
          userId,
          date: createdOn,
          createdOn: createdOn,
          updatedOn: createdOn,
          createdByUserId: userId,
          updatedByUserId: userId,
          isDeleted: false,
        })
        .execute();

      const newBlogId = insertResult.identifiers[0].id;

      const createdBlog = await queryRunner.manager.findOne(Blog, {
        where: { id: newBlogId },
      });

      if (!createdBlog) {
        throw new Error('Failed to fetch newly created blog');
      }

      await queryRunner.commitTransaction();
      return createdBlog;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}