import {Controller,Get,Query,ValidationPipe,UseGuards, Post, Req, Body, Put, Param, Delete,} from '@nestjs/common';
import { ReminderNoteService } from '../services/reminder-note.service';
import { ReminderNoteRequestDto } from '../dto/reminder-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { ReminderNoteApiResponseDto } from '../dto/reminder-response.dto';
import { CreateReminderNoteRequestDto } from '../dto/create-reminder-note-request.dto';
import { CreateReminderNoteResponseDto } from '../dto/create-reminder-note-response.dto';
import { UpdateReminderNoteRequestDto } from '../dto/update-reminder-note-request.dto';
import { UpdateReminderNoteResponseDto } from '../dto/update-reminder-note-response.dto';
import { DeleteReminderNoteResponseDto } from '../dto/delete-reminder-note-response.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('admin/v2')
export class ReminderNoteController {
  constructor(private readonly reminderNoteService: ReminderNoteService) {}

  @Get('reminder-note')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getReminderNotes(
    @Query(ValidationPipe) query: ReminderNoteRequestDto,
  ): Promise<ReminderNoteApiResponseDto | any> {
    try {
      const data = await this.reminderNoteService.getReminderNotes(query);

      return ResponseHelper.success(
        data,
        'Reminder Note retrieved successfully',
      );
    } catch (error) {
      console.error('Error fetching Reminder Notes:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve Reminder Notes',
      );
    }
  }

@Post('reminder-notes')
@Roles(RolesEnum.ADMINISTRATOR)
async createReminderNote(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateReminderNoteRequestDto,
): Promise<CreateReminderNoteResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.reminderNoteService.createReminderNote(
      userId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Reminder note created successfully',
    );

  } catch (error) {
    console.error('Error in createReminderNote controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('required') ||
      error.message?.includes('Invalid') ||
      error.message?.includes('already exists')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create reminder note',
    );
  }
}
@Put('reminder-notes/:id')
@Roles(RolesEnum.BACKEND_USER)
async updateReminderNote(
  @Req() req: any,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateReminderNoteRequestDto,
): Promise<UpdateReminderNoteResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.reminderNoteService.updateReminderNote(
      id,
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      'Reminder note updated successfully',
    );

  } catch (error) {
    console.error('Error in updateReminderNote controller:', error);

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
      'Failed to update reminder note',
    );
  }
}
@Delete('reminder-notes/:id')
@Roles(RolesEnum.ADMINISTRATOR)
async deleteReminderNote(
  @Req() req: any,
  @Param('id') id: number,
): Promise<DeleteReminderNoteResponseDto | any> {
  try {
    const userId = req.user?.id;

    const result = await this.reminderNoteService.deleteReminderNote(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      'Reminder note deleted successfully',
    );

  } catch (error) {
    console.error('Error in deleteReminderNote controller:', error);

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
      'Failed to delete reminder note',
    );
  }
}


}
