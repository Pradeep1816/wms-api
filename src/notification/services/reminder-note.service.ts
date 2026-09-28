import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReminderNoteRepository } from '../repositories/reminder-note.repository';
import { ReminderNoteTransformationService } from './transformations/reminder-note-transformation.service';
import { ReminderNoteRequestDto } from '../dto/reminder-request.dto';
import { ReminderNoteListResponseDto } from '../dto/reminder-response.dto';
import { CreateReminderNoteRequestDto } from '../dto/create-reminder-note-request.dto';
import { CreateReminderNoteResponseDto } from '../dto/create-reminder-note-response.dto';
import { plainToInstance } from 'class-transformer';
import { formatDate } from 'src/utils/date-utils';
import { UpdateReminderNoteRequestDto } from '../dto/update-reminder-note-request.dto';
import { UpdateReminderNoteResponseDto } from '../dto/update-reminder-note-response.dto';
import { DeleteReminderNoteResponseDto } from '../dto/delete-reminder-note-response.dto';


@Injectable()
export class ReminderNoteService {
  constructor(
    private readonly reminderNoteRepo: ReminderNoteRepository,
    private readonly transformService: ReminderNoteTransformationService,
  ) {}

  async getReminderNotes(
    query: ReminderNoteRequestDto,
  ): Promise<ReminderNoteListResponseDto> {
    const { page, limit, sort, order } = query;
    const { items, total } = await this.reminderNoteRepo.findReminderNotes(
      page,
      limit,
      sort,
      order,
    );


    const body = this.transformService.transformRows(items);


    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    return {
      body,
      pagination,
    };
  }
  async createReminderNote(
  userId: number,
  createDto: CreateReminderNoteRequestDto,
): Promise<CreateReminderNoteResponseDto | any> {
  try {

    const note = await this.reminderNoteRepo.createReminderNote(
      createDto,
      userId,
    );

  
    const response = plainToInstance(CreateReminderNoteResponseDto, note, {
      excludeExtraneousValues: true,
    });

  
    response.createdOn = formatDate(note.createdOn);


    response.createdByUserId = userId;

    return response;

  } catch (error) {
    console.error('Error in createReminderNote service:', error);

  if (error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error; 
    }

    throw new BadRequestException('Failed to create reminder note');
  }
}
async updateReminderNote(
  id: number,
  userId: number,
  updateDto: UpdateReminderNoteRequestDto,
): Promise<UpdateReminderNoteResponseDto | any> {
  try {

    const updatedNote = await this.reminderNoteRepo.updateReminderNote(
      id,
      updateDto,
      userId,
    );

    const response = plainToInstance(
      UpdateReminderNoteResponseDto,
      updatedNote,
      {
        excludeExtraneousValues: true,
      },
    );

    response.updatedOn = formatDate(updatedNote.updatedOn);

    return response;

  } catch (error) {
    console.error('Error in updateReminderNote service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to update reminder note');
  }
}
async deleteReminderNote(
  id: number,
  userId: number,
): Promise<DeleteReminderNoteResponseDto | any> {
  try {
    const deletedResult = await this.reminderNoteRepo.deleteReminderNote(
      id,
      userId,
    );

    if (!deletedResult || !deletedResult.id) {
      throw new BadRequestException('Failed to delete reminder note');
    }

    const response = plainToInstance(
      DeleteReminderNoteResponseDto,
      deletedResult,
      {
        excludeExtraneousValues: true,
      },
    );

    return response;

  } catch (error) {
    console.error('Error in deleteReminderNote service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to delete reminder note');
  }
}

}