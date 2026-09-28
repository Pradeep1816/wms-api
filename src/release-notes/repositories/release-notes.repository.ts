import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { ReleaseNotes } from '../entities/release-notes.entity';
import { User } from 'src/user/entities/user.entity';
import { ReleaseNotesRead } from '../entities/release-notes-read.entity';
import { CreateReleaseNoteRequestDto } from '../dto/create-release-notes-request.dto';
import { UpdateReleaseNoteRequestDto } from '../dto/update-release-notes-request.dto';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ReleaseNotesReadStatus } from '../enums/release-notes-read-status.enum';
import { convertToESTDate, getCurrentESTDate } from '../../utils/date-utils';


@Injectable()
export class ReleaseNotesRepository {
  constructor(
    @InjectRepository(ReleaseNotes)
    private readonly releaseNotesRepo: Repository<ReleaseNotes>,
  ) {}

  async getReleaseNotes(
    page: number, 
    limit: number, 
    isAdmin: boolean = false,
    sortBy: 'subject' | 'scheduleDate' | 'createdDate' | 'id' = 'id',
    sortDir: 'asc' | 'desc' = 'desc'
  ) {
  const offset = (page - 1) * limit;
  const currentDate = new Date();

  const query = this.releaseNotesRepo
    .createQueryBuilder('rn')
    .leftJoin('user_profile', 'up', 'up.user_id = rn.user_id')
    .select([
      'rn.id AS id',
      'rn.subject AS subject',
      'rn.summary AS summary',
      'rn.notes AS notes',
      'rn.version AS version',
      'rn.schedule_date AS scheduleDate',
      'rn.date AS date',
      'rn.user_id AS userId',
      'up.firstname AS firstname',
      'up.lastname AS lastname',
    ])
    .where('rn.isDeleted = 0');

  // Non-admin users only see notes where schedule_date <= current date
  if (!isAdmin) {
    query.andWhere('rn.schedule_date <= :currentDate', { currentDate });
  }

  // Map frontend sortBy to database column names
  const sortColumnMap: Record<string, string> = {
    'subject': 'rn.subject',
    'scheduleDate': 'rn.schedule_date',
    'createdDate': 'rn.date',
    'id': 'rn.id',
  };

  const sortColumn = sortColumnMap[sortBy] || 'rn.id';
  const sortDirection = sortDir.toUpperCase() as 'ASC' | 'DESC';

  query.orderBy(sortColumn, sortDirection)
    .offset(offset)
    .limit(limit);

  const items = await query.getRawMany();

  // Build count query with same filters
  const countQuery = this.releaseNotesRepo
    .createQueryBuilder('rn')
    .where('rn.isDeleted = 0');

  if (!isAdmin) {
    countQuery.andWhere('rn.schedule_date <= :currentDate', { currentDate });
  }

  const total = await countQuery.getCount();

  return { items, total };
}
async createReleaseNote(
  userId: number,
  createDto: CreateReleaseNoteRequestDto,
) {
  const queryRunner =
    this.releaseNotesRepo.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const {
      scheduleDate,
      version,
      subject,
      summary,
      notes,
    } = createDto;

    // Convert schedule date to EST timezone (2 AM EST) to match legacy system behavior
    const normalizedScheduleDate = convertToESTDate(scheduleDate);

    // Use EST timezone for created date to match legacy system behavior
    const createdDate = getCurrentESTDate();

    const insertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(ReleaseNotes)
      .values({
        subject,
        version,
        summary,
        notes,
        scheduleDate: normalizedScheduleDate,
        userId,
        isDeleted: false,
        date: createdDate,
      })
      .execute();

    const releaseNoteId = insertResult.identifiers[0]?.id;

    if (!releaseNoteId) {
      throw new Error('Failed to create release note');
    }

  
    // Get only backend users (administrator, owner, staffmember) like legacy system
    const users = await queryRunner.manager
      .createQueryBuilder()
      .select('user.id', 'id')
      .from(User, 'user')
      .innerJoin('rbac_auth_assignment', 'rba', 'rba.user_id = CAST(user.id AS CHAR)')
      .innerJoin('rbac_auth_item', 'rbi', 'rbi.name = rba.item_name')
      .where('user.isDeleted = false')
      .andWhere('rbi.name IN (:...roles)', { 
        roles: [RolesEnum.ADMINISTRATOR, RolesEnum.OWNER, RolesEnum.STAFFMEMBER] 
      })
      .distinct(true)
      .getRawMany();

  
    const readEntries = users.map(user => ({
      releaseNoteId,
      userId: user.id,
      isRead: ReleaseNotesReadStatus.UN_READ,       
      isDeleted: false,
    }));

    if (readEntries.length > 0) {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(ReleaseNotesRead)
        .values(readEntries)
        .execute();
    }


    await queryRunner.commitTransaction();

   
    return await queryRunner.manager.findOne(ReleaseNotes, {
      where: { id: releaseNoteId },
    });

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

private async getExistingReleaseNote(
  id: number,
  queryRunner: QueryRunner,
) {
  return await queryRunner.manager
    .createQueryBuilder()
    .select('release_notes')
    .from(ReleaseNotes, 'release_notes')
    .where('release_notes.id = :id', { id })
    .andWhere('release_notes.isDeleted = false')
    .getOne();
}
async updateReleaseNote(
  id: number,
  updateDto: UpdateReleaseNoteRequestDto,
  userId: number,
) {
  const queryRunner =
    this.releaseNotesRepo.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
        const existingReleaseNote = await this.getExistingReleaseNote(
        id,
        queryRunner,
      );


    if (!existingReleaseNote) {
      throw new NotFoundException('Release note not found');
    }

  
    const updateData: any = {};

    if (updateDto.subject) updateData.subject = updateDto.subject;
    if (updateDto.summary) updateData.summary = updateDto.summary;
    if (updateDto.notes) updateData.notes = updateDto.notes;

    if (updateDto.scheduleDate) {
      // Convert schedule date to EST timezone (2 AM EST) to match legacy system behavior
      const normalizedScheduleDate = convertToESTDate(updateDto.scheduleDate);
      updateData.scheduleDate = normalizedScheduleDate;
    }
    if(updateDto.version)updateData.version=updateDto.version;
  

    updateData.userId = userId; 
    // Use EST timezone for updated date to match legacy system behavior
    updateData.date = getCurrentESTDate(); 


    await queryRunner.manager
      .createQueryBuilder()
      .update(ReleaseNotes)
      .set(updateData)
      .where('id = :id', { id })
      .execute();

  
    const updatedReleaseNote = await queryRunner.manager.findOne(
      ReleaseNotes,
      { where: { id } },
    );

    if (!updatedReleaseNote) {
      throw new Error('Failed to fetch updated release note');
    }

    await queryRunner.commitTransaction();
    return updatedReleaseNote;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}
async deleteReleaseNote(
  id: number,
  userId: number,
) {
  const queryRunner =
    this.releaseNotesRepo.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
 
    const existingReleaseNote = await this.getExistingReleaseNote(
      id,
      queryRunner,
    );

    if (!existingReleaseNote) {
      throw new NotFoundException('Release note not found');
    }

    // Use EST timezone for deleted date to match legacy system behavior
    const deletedOn = getCurrentESTDate();

    await queryRunner.manager
      .createQueryBuilder()
      .update(ReleaseNotes)
      .set({
        isDeleted: true,
        userId: userId,   
        date: deletedOn,  
      })
      .where('id = :id', { id })
      .execute();

    await queryRunner.commitTransaction();


    return {
      id: id,
      deletedByUserId: userId,
      deletedOn: deletedOn,
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

  /**
   * Get latest unread release note for a user (for popup on login)
   * Matches legacy actionRead() behavior
   */
  async getLatestUnreadNote(userId: number, userLoggedAt: number): Promise<any> {
    const userLoggedAtDate = new Date(userLoggedAt * 1000); // Convert Unix timestamp to Date

    const query = this.releaseNotesRepo.manager
      .createQueryBuilder()
      .select([
        'rn.id AS id',
        'rn.subject AS subject',
        'rn.summary AS summary',
        'rn.notes AS notes',
        'rn.schedule_date AS scheduleDate',
        'rn.date AS date',
        'rn.user_id AS userId',
        'rnr.id AS readId',
        'rnr.is_read AS isRead',
      ])
      .from(ReleaseNotesRead, 'rnr')
      .innerJoin(ReleaseNotes, 'rn', 'rn.id = rnr.release_note_id')
      .where('rnr.user_id = :userId', { userId })
      .andWhere('rnr.isDeleted = false')
      .andWhere('rn.isDeleted = false')
      .andWhere('rn.schedule_date <= :userLoggedAt', { userLoggedAt: userLoggedAtDate })
      .andWhere('(rnr.is_read = :unread OR rnr.is_read = :okOnly)', {
        unread: ReleaseNotesReadStatus.UN_READ,
        okOnly: ReleaseNotesReadStatus.OK_ONLY,
      })
      .orderBy('rn.id', 'DESC')
      .limit(1);

    const result = await query.getRawOne();
    return result;
  }

  /**
   * Update read status for release notes (popup ok action)
   * Matches legacy actionPopupOk() behavior
   */
  async updateReadStatusForUser(
    userId: number,
    userLoggedAt: number,
    isRead: boolean,
  ): Promise<void> {
    const userLoggedAtDate = new Date(userLoggedAt * 1000);
    const newStatus = isRead
      ? ReleaseNotesReadStatus.DO_NOT_SHOW_AGAIN_OK
      : ReleaseNotesReadStatus.OK_ONLY;

    // Use a more compatible approach with TypeORM
    const releaseNoteIds = await this.releaseNotesRepo.manager
      .createQueryBuilder()
      .select('rn.id', 'id')
      .from(ReleaseNotes, 'rn')
      .where('rn.isDeleted = false')
      .andWhere('rn.schedule_date <= :userLoggedAt', { userLoggedAt: userLoggedAtDate })
      .getRawMany();

    const ids = releaseNoteIds.map((item) => item.id);

    if (ids.length === 0) {
      return;
    }

    await this.releaseNotesRepo.manager
      .createQueryBuilder()
      .update(ReleaseNotesRead)
      .set({ isRead: newStatus })
      .where('user_id = :userId', { userId })
      .andWhere('isDeleted = false')
      .andWhere('release_note_id IN (:...ids)', { ids })
      .andWhere('(is_read = :unread OR is_read = :okOnly)', {
        unread: ReleaseNotesReadStatus.UN_READ,
        okOnly: ReleaseNotesReadStatus.OK_ONLY,
      })
      .execute();
  }

  /**
   * Update read status for a specific release note
   * Matches legacy actionUpdateReadNotes() behavior
   * Legacy creates a NEW record if doesn't exist (default isRead = 0)
   */
  async updateReadStatusForNote(
    releaseNoteId: number,
    userId: number,
  ): Promise<void> {
    // Check if record exists
    const existingRecord = await this.releaseNotesRepo.manager
      .createQueryBuilder()
      .select('rnr.id', 'id')
      .from(ReleaseNotesRead, 'rnr')
      .where('rnr.release_note_id = :releaseNoteId', { releaseNoteId })
      .andWhere('rnr.user_id = :userId', { userId })
      .andWhere('rnr.isDeleted = false')
      .getRawOne();

    if (existingRecord) {
      // Update existing record - set to OK_ONLY (3) to match legacy behavior
      // Note: Legacy creates with default 0, but this endpoint is typically called
      // when user marks as read, so we set to OK_ONLY
      await this.releaseNotesRepo.manager
        .createQueryBuilder()
        .update(ReleaseNotesRead)
        .set({ isRead: ReleaseNotesReadStatus.OK_ONLY })
        .where('id = :id', { id: existingRecord.id })
        .execute();
    } else {
      // Create new record if doesn't exist (matches legacy behavior)
      // Legacy creates with default isRead = 0 (UN_READ)
      await this.releaseNotesRepo.manager
        .createQueryBuilder()
        .insert()
        .into(ReleaseNotesRead)
        .values({
          releaseNoteId,
          userId,
          isRead: ReleaseNotesReadStatus.UN_READ, // Default 0 like legacy
          isDeleted: false,
        })
        .execute();
    }
  }
}