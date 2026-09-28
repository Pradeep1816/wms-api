import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from '../entities/notes.entity';
import { CreateCommentRequestDto } from '../dto/comment-request.dto';
import { NoteInstanceType } from '../enums/comment.enum';

@Injectable()
export class CommentRepository {
  constructor(
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
  ) {}


  // Find comments by customer ID
 // This is outdated and will be removed
  async findCommentsByCustomerId(customerId: number): Promise<Note[]> {
    return this.noteRepository.find({
      where: { 
        instanceId: customerId, 
        instanceType: Note.INSTANCE_TYPE_USER
      },
      order: { createdOn: 'DESC' },
      relations: ['user', 'user.profile'],
    });
  }

  // Find comments by instance type and instance id
  async findComments(instanceType: NoteInstanceType, instanceId: number, page: number, limit: number): Promise<{ comments: Note[]; total: number }> {
    try {
      const [comments, total] = await this.noteRepository.findAndCount({
        where: { instanceId, instanceType },
        relations: ['user', 'user.profile'],
        skip: ((page || 1) - 1) * (limit || 20),
        take: limit || 20,
        order: { createdOn: 'DESC' },
        
      });
      return { comments, total };
    } catch (error) {
      console.error('Error in findComments repository:', error);
      throw new Error(`Failed to retrieve comments: ${error.message}`);
    }
  }

  /**
   * Create a new note/comment
   * @param noteData - Note data to create
   * @param createdUserId - User ID who is creating the note
   * @returns The created note
   */
  async createNote(
    noteData: {
      instanceId: number;
      instanceType: number;
      content: string;
    },
    createdUserId: number,
  ): Promise<Note> {
    const note = this.noteRepository.create({
      instanceId: noteData.instanceId,
      instanceType: noteData.instanceType,
      content: noteData.content,
      createdUserId,
    });

    return await this.noteRepository.save(note);
  }

}
