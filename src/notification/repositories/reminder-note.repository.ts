import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReminderNote } from '../entities/reminder-note.entity';
import { CreateReminderNoteRequestDto } from '../dto/create-reminder-note-request.dto';
import { UpdateReminderNoteRequestDto } from '../dto/update-reminder-note-request.dto';

@Injectable()
export class ReminderNoteRepository {
  constructor(
    @InjectRepository(ReminderNote)
    private readonly repo: Repository<ReminderNote>,
  ) {}

  async findReminderNotes(
    page: number = 1,
    limit: number = 20,
    sort: 'notes',
    order: 'ASC' | 'DESC',
  ) {
    const query = this.repo.createQueryBuilder('reminderNote');

    const sortMapping = {
      notes: 'reminderNote.notes',
    };

    const sortField = sortMapping[sort];

    
    query.orderBy(sortField, order);


    const total = await query.getCount();


    const items = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total };
  }
  async createReminderNote(
  createDto: CreateReminderNoteRequestDto,
  userId: number,
):Promise<any> {
  const queryRunner = this.repo.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { notes } = createDto;

    const createdOn = new Date();
    const insertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('reminder_note')
      .values({
        notes,
        createdOn,
        createdByUserId: userId,
    
      })
      .execute();

    const newId = insertResult.identifiers[0].id;

 
    const created = await queryRunner.manager.findOne('reminder_note', {
      where: { id: newId },
    });

    await queryRunner.commitTransaction();
    return created;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
private async getExistingReminderNote(
  id: number,
  queryRunner: any,
) {
  return await queryRunner.manager
    .createQueryBuilder()
    .select('reminder_note')
    .from(ReminderNote, 'reminder_note')
    .where('reminder_note.id = :id', { id })
    .getOne();
}
async updateReminderNote(
  id: number,
  updateDto: UpdateReminderNoteRequestDto,
  userId: number,
) {
  const { notes } = updateDto;

  const queryRunner =
    this.repo.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingNote = await this.getExistingReminderNote(id, queryRunner);

    if (!existingNote) {
      throw new NotFoundException('Reminder note not found');
    }

    const updateData: any = {};
    if (notes) updateData.notes = notes;


    updateData.updatedOn = new Date();
    updateData.updatedByUserId = userId;

    await queryRunner.manager
      .createQueryBuilder()
      .update(ReminderNote)
      .set(updateData)
      .where('id = :id', { id })
      .execute();

    const updatedNote = await queryRunner.manager.findOne(ReminderNote, {
      where: { id },
    });

    if (!updatedNote) {
      throw new Error('Failed to fetch updated reminder note');
    }

    await queryRunner.commitTransaction();

    return updatedNote;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}
async deleteReminderNote(
  id: number,
  userId: number,
) {
  const queryRunner =
    this.repo.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingNote = await this.getExistingReminderNote(id, queryRunner);

    if (!existingNote) {
      throw new NotFoundException('Reminder note not found');
    }

    await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from(ReminderNote)
      .where('id = :id', { id })
      .execute();

    await queryRunner.commitTransaction();

    return {
      id: existingNote.id,
      notes: existingNote.notes,
      deletedByUserId: userId,
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
} 

}