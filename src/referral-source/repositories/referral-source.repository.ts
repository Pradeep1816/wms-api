import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { ReferralSource } from '../entities/referral-source.entity';
import { CreateReferralSourceRequestDto } from '../dto/create-referral-source-request.dto';
import { UpdateReferralSourceRequestDto } from '../dto/update-referral-source-request.dto';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class ReferralSourceRepository {
  constructor(
    @InjectRepository(ReferralSource)
    private readonly referralSourceRepository: Repository<ReferralSource>,
  ) { }

  // Get Existing Referral Source
  private async getExistingReferralSource(
    id: number,
    queryRunner: QueryRunner,
  ) {
    return await queryRunner.manager.findOne(ReferralSource, {
      where: { id, isDeleted: 0 },
    });
  }

  /**
   * Get all active referral sources
   * @returns Array of active referral sources
   */
  async getActiveReferralSources(
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC'):
    Promise<ReferralSource[]> {
    return this.referralSourceRepository
      .createQueryBuilder('referralSource')
      .where('referralSource.isDeleted = :isDeleted', { isDeleted: 0 })
      .orderBy('referralSource.name', 'ASC')
      .addOrderBy(`referralSource.${sort}`, order)
      .getMany();
  }

  // Create Referral Source
  async createReferralSource(
    createDto: CreateReferralSourceRequestDto,
    userId: number,
  ): Promise<any> {

    const queryRunner =
      this.referralSourceRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { name } = createDto;
      const now = getCurrentESTDate();

      const insertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('referral_sources')
        .values({
          name,
          createdOn: now,
          updatedOn: now,
          createdByUserId: userId,
          updatedByUserId: userId,
          isDeleted: 0,
        })
        .execute();

      const newId = insertResult.identifiers[0].id;

      const created = await queryRunner.manager.findOne('referral_sources', {
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


  // Update Referral Source
  async updateReferralSource(
    id: number,
    userId: number,
    updateDto: UpdateReferralSourceRequestDto
  ) {
    const { name } = updateDto
    const queryRunner = this.referralSourceRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingReferralSource = await this.getExistingReferralSource(id, queryRunner);

      if (!existingReferralSource) {
        throw new NotFoundException('Referral source not found');
      }

      const updateData: any = {};

      if (name) updateData.name = name;
      updateData.updatedOn = getCurrentESTDate();
      updateData.updatedByUserId = userId;

      await queryRunner.manager
        .createQueryBuilder()
        .update(ReferralSource)
        .set(updateData)
        .where('id = :id', { id })
        .execute();

      const updateSource = await queryRunner.manager.findOne(ReferralSource, {
        where: { id },
      });

      if (!updateSource) {
        throw new Error('Failed to  fetch updated ReferralSource')
      }

      await queryRunner.commitTransaction();

      return updateSource;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

  }

  async deleteReferralSource(
    id: number,
    userId: number,
  ) {
    const queryRunner =
      this.referralSourceRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingReferralSource =
        await this.getExistingReferralSource(id, queryRunner);

      if (!existingReferralSource) {
        throw new NotFoundException('Referral source not found');
      }



      await queryRunner.manager
        .createQueryBuilder()
        .update(ReferralSource)
        .set({
          isDeleted: 1,
          updatedOn: getCurrentESTDate(),
          updatedByUserId: userId,
        })
        .where('id = :id', { id })
        .execute();

      await queryRunner.commitTransaction();

      return {
        id: existingReferralSource.id,
        name: existingReferralSource.name,
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
