import { Injectable, NotFoundException } from '@nestjs/common';
import { CommentRepository } from '../repositories/comment.repository';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentsDataDto } from '../dto/comment-response.dto';
import { CommentRequestDto, CommentsRequestDto } from '../dto/comment-request.dto';
import { CommentTransformationService } from './transformations/comment-transformation.service';
import { Note } from '../entities/notes.entity';
import { NoteInstanceType } from '../enums/comment.enum';

@Injectable()
export class CommentService {
    constructor(
        private readonly commentRepository: CommentRepository,
        @InjectRepository(Location)
        private readonly locationRepository: Repository<Location>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly commentTransformationService: CommentTransformationService,
    ) { }

    async getCommentsByCustomerId(locationSlug: string, customerId: number): Promise<CommentsDataDto> {
        try {
            // Get location
            const location = await this.locationRepository.findOne({
                where: { slug: locationSlug }
            });
            if (!location) {
                throw new NotFoundException(`Location not found: ${locationSlug}`);
            }

            // Get user
            const customer = await this.userRepository.findOne({
                where: { id: customerId, isDeleted: false }
            });

            if (!customer) {
                throw new NotFoundException(`Customer not found: ${customerId}`);
            }

            // Get comments for the user
            const comments = await this.commentRepository.findCommentsByCustomerId(customerId);

            // Return with pagination (all comments, no pagination applied)
            return this.commentTransformationService.transformCommentsData(comments, comments.length, 1, comments.length || 1);
        } catch (error) {
            console.error('Error in getCommentsByUserId service:', error);
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new Error(`Failed to retrieve comments: ${error.message}`);
        }
    }

    async getNotes(query: CommentRequestDto): Promise<CommentsDataDto> {
        try {
            // Get location


            const { page = 1, limit = 20, type, id } = query;
            const { comments, total } = await this.commentRepository.findComments(type, id, page, limit);
            return this.commentTransformationService.transformCommentsData(comments, total, page, limit);
        } catch (error) {
            console.error('Error in getNotes service:', error);
            throw new Error(`Failed to retrieve notes: ${error.message}`);
        }
    }

    /**
     * Create a new note/comment
     * Replicates legacy NoteController::actionCreate() logic
     * @param instanceId - The instance ID (e.g., customer ID, student ID)
     * @param instanceType - The instance type (1=student, 2=user, 3=lesson, 4=invoice, 5=proforma)
     * @param content - The note content
     * @param createdUserId - User ID who is creating the note
     * @returns Created note and updated comments list
     */
    async createNote(
        instanceId: number,
        instanceType: number,
        content: string,
        createdUserId: number,
    ): Promise<{ note: Note; comments: CommentsDataDto }> {
        try {
            // Create the note
            const note = await this.commentRepository.createNote(
                {
                    instanceId,
                    instanceType,
                    content,
                },
                createdUserId,
            );

            // Get all comments for this instance (matching legacy behavior)
            const { comments, total } = await this.commentRepository.findComments(
                instanceType as NoteInstanceType,
                instanceId,
                1,
                1000, // Get all comments (legacy returns all)
            );

            // Transform comments data
            const commentsData = this.commentTransformationService.transformCommentsData(
                comments,
                total,
                1,
                total || 1,
            );

            return {
                note,
                comments: commentsData,
            };
        } catch (error) {
            console.error('Error in createNote service:', error);
            throw new Error(`Failed to create note: ${error.message}`);
        }
    }


}
