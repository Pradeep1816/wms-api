import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReleaseNotesRepository } from '../repositories/release-notes.repository';
import { ReleaseNotesTransformationService } from './transformation/release-notes-transformation.service';
import { plainToInstance } from 'class-transformer';
import { CreateReleaseNoteRequestDto } from '../dto/create-release-notes-request.dto';
import { CreateReleaseNoteResponseDto } from '../dto/create-release-notes-response.dto';
import { UpdateReleaseNoteRequestDto } from '../dto/update-release-notes-request.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';






@Injectable()
export class ReleaseNotesService {
  constructor(
    private readonly releaseNotesRepo: ReleaseNotesRepository,
    private readonly transformer: ReleaseNotesTransformationService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getReleaseNotes(
    page: number, 
    limit: number, 
    isAdmin: boolean = false,
    sortBy: 'subject' | 'scheduleDate' | 'createdDate' | 'id' = 'id',
    sortDir: 'asc' | 'desc' = 'desc'
  ) {
    const { items, total } = await this.releaseNotesRepo.getReleaseNotes(
      page,
      limit,
      isAdmin,
      sortBy,
      sortDir,
    );

    if (!items.length) {
      throw new NotFoundException('No release notes found');
    }

    return this.transformer.transformRows(items, page, limit, total);
  }
  async createReleaseNote(
  userId: number,
  createDto: CreateReleaseNoteRequestDto,
): Promise<CreateReleaseNoteResponseDto | any> {
  try {

    const createdReleaseNote: any =
      await this.releaseNotesRepo.createReleaseNote(
        userId,
        createDto,
      );

 
    const response = plainToInstance(
      CreateReleaseNoteResponseDto,
      createdReleaseNote,
      {
        excludeExtraneousValues: true,
      },
    );

    

    response.createdByUserId = userId;

    return response;

  } catch (error) {
    console.error('Error in createReleaseNote service:', error);


    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

   
    throw new BadRequestException('Failed to create release note');
  }
}

async updateReleaseNote(
  id: number,
  userId: number,
  updateDto: UpdateReleaseNoteRequestDto,
) {
  try {
    const updatedReleaseNote =
      await this.releaseNotesRepo.updateReleaseNote(
        id,
        updateDto,
        userId,
      );

 
    return {
      id: updatedReleaseNote.id,
      subject: updatedReleaseNote.subject,
      scheduleDate: updatedReleaseNote.scheduleDate,
      updatedByUserId: updatedReleaseNote.userId,
    };

  } catch (error) {
    console.error('Error in updateReleaseNote service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to update release note');
  }
}
async deleteReleaseNote(
  id: number,
  userId: number,
) {
  try {
    const deletedResult =
      await this.releaseNotesRepo.deleteReleaseNote(
        id,
        userId,
      );

    if (!deletedResult || !deletedResult.id) {
      throw new BadRequestException('Failed to delete release note');
    }

  
    return {
      id: deletedResult.id,
      deletedByUserId: userId,
      deletedOn: deletedResult.deletedOn,
    };

  } catch (error) {
    console.error('Error in deleteReleaseNote service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to delete release note');
  }
}

  /**
   * Get latest unread release note for popup on login
   * Matches legacy actionRead() behavior
   */
  async getLatestUnreadNote(userId: number): Promise<any> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, isDeleted: false },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Use current time if logged_at is null (first login)
      const userLoggedAt = user.logged_at || Math.floor(Date.now() / 1000);

      const latestNote = await this.releaseNotesRepo.getLatestUnreadNote(
        userId,
        userLoggedAt,
      );

      if (!latestNote) {
        return null;
      }

      return latestNote;
    } catch (error) {
      console.error('Error in getLatestUnreadNote service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to get latest unread note');
    }
  }

  /**
   * Update read status for popup ok action
   * Matches legacy actionPopupOk() behavior
   */
  async updateReadStatusForPopup(
    userId: number,
    isRead: boolean,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, isDeleted: false },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const userLoggedAt = user.logged_at || Math.floor(Date.now() / 1000);

      await this.releaseNotesRepo.updateReadStatusForUser(
        userId,
        userLoggedAt,
        isRead,
      );
    } catch (error) {
      console.error('Error in updateReadStatusForPopup service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to update read status');
    }
  }

  /**
   * Update read status for a specific release note
   * Matches legacy actionUpdateReadNotes() behavior
   */
  async updateReadStatusForNote(
    releaseNoteId: number,
    userId: number,
  ): Promise<void> {
    try {
      await this.releaseNotesRepo.updateReadStatusForNote(
        releaseNoteId,
        userId,
      );
    } catch (error) {
      console.error('Error in updateReadStatusForNote service:', error);
      throw new BadRequestException('Failed to update read status');
    }
  }
}