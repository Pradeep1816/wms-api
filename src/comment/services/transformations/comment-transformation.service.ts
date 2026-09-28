import { Injectable } from '@nestjs/common';
import { Note } from '../../entities/notes.entity';
import { CommentDto, CommentsDataDto } from '../../dto/comment-response.dto';
import { formatSimpleDateTime } from '../../../utils/date-utils';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CommentTransformationService {
  /**
   * Transform a single Note entity to CommentDto format
   * @param comment - Note entity with relations
   * @returns CommentDto
   */
  transformCommentToDto(comment: Note): CommentDto {
    const createdUser = comment.user?.profile
      ? `${comment.user.profile.firstname || ''} ${comment.user.profile.lastname || ''}`.trim()
      : 'Unknown User';

    const dtoData = {
      id: comment.id,
      content: comment.content,
      createdUser: createdUser,
      avatar: 'admin/img/anonymous.jpg',
      createdOn: comment.createdOn ? formatSimpleDateTime(comment.createdOn) : null,
    };

    return plainToInstance(CommentDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple Note entities to CommentDto array
   * @param comments - Array of Note entities
   * @returns Array of CommentDto
   */
  transformCommentList(comments: Note[]): CommentDto[] {
    return comments.map(comment => this.transformCommentToDto(comment));
  }

  /**
   * Transform comments data to CommentsDataDto format
   * @param comments - Array of Note entities
   * @param total - Total number of comments
   * @param page - Current page number
   * @param limit - Items per page
   * @returns CommentsDataDto
   */
  transformCommentsData(comments: Note[], total: number, page: number, limit: number): CommentsDataDto {
    const formattedComments = this.transformCommentList(comments);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedComments,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(CommentsDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}

