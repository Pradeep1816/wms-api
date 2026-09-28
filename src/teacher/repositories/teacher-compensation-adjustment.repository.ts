import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherCompensationAdjustment } from '../entities/teacher-compensation-adjustment.entity';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

interface TeacherCompensationAdjustmentLookup {
  locationId: number;
  teacherId: number;
  documentType: TeacherDocumentSignatureRequestType;
  startDate: string;
  endDate: string;
}

@Injectable()
export class TeacherCompensationAdjustmentRepository {
  constructor(
    @InjectRepository(TeacherCompensationAdjustment)
    private readonly repository: Repository<TeacherCompensationAdjustment>,
  ) {}

  findActiveByRange(
    params: TeacherCompensationAdjustmentLookup,
  ): Promise<TeacherCompensationAdjustment | null> {
    return this.repository.findOne({
      where: {
        locationId: params.locationId,
        teacherId: params.teacherId,
        startDate: params.startDate,
        endDate: params.endDate,
        isDeleted: false,
      },
      order: {
        id: 'DESC',
      },
    });
  }

  findActiveWithinRange(
    params: TeacherCompensationAdjustmentLookup,
  ): Promise<TeacherCompensationAdjustment[]> {
    return this.repository
      .createQueryBuilder('adjustment')
      .where('adjustment.locationId = :locationId', {
        locationId: params.locationId,
      })
      .andWhere('adjustment.teacherId = :teacherId', {
        teacherId: params.teacherId,
      })
      .andWhere('adjustment.startDate >= :startDate', {
        startDate: params.startDate,
      })
      .andWhere('adjustment.endDate <= :endDate', {
        endDate: params.endDate,
      })
      .andWhere('adjustment.isDeleted = false')
      .orderBy('adjustment.startDate', 'ASC')
      .addOrderBy('adjustment.endDate', 'ASC')
      .addOrderBy('adjustment.id', 'ASC')
      .getMany();
  }

  async upsertRange(
    params: TeacherCompensationAdjustmentLookup & {
      minimumHours: number;
      hourlyRate?: number | null;
      note?: string | null;
      userId: number;
      preserveHourlyRate?: boolean;
    },
  ): Promise<TeacherCompensationAdjustment> {
    const existing = await this.findActiveByRange(params);
    const now = new Date();

    if (existing) {
      existing.minimumHours = RoundingUtils.roundDecimal(params.minimumHours, 2).toFixed(2);
      if (!params.preserveHourlyRate) {
        existing.hourlyRate =
          params.hourlyRate == null
            ? null
            : RoundingUtils.roundDecimal(params.hourlyRate, 2).toFixed(2);
      }
      existing.note = params.note || null;
      existing.updatedByUserId = params.userId;
      existing.updatedOn = now;

      return this.repository.save(existing);
    }

    return this.repository.save(
      this.repository.create({
        locationId: params.locationId,
        teacherId: params.teacherId,
        documentType: params.documentType,
        startDate: params.startDate,
        endDate: params.endDate,
        minimumHours: RoundingUtils.roundDecimal(params.minimumHours, 2).toFixed(2),
        hourlyRate:
          params.hourlyRate == null
            ? null
            : RoundingUtils.roundDecimal(params.hourlyRate, 2).toFixed(2),
        note: params.note || null,
        createdByUserId: params.userId,
        updatedByUserId: params.userId,
        createdOn: now,
        updatedOn: now,
        isDeleted: false,
      }),
    );
  }

  async softDelete(params: {
    id: number;
    locationId: number;
    teacherId: number;
    userId: number;
  }): Promise<boolean> {
    const adjustment = await this.repository.findOne({
      where: {
        id: params.id,
        locationId: params.locationId,
        teacherId: params.teacherId,
        isDeleted: false,
      },
    });

    if (!adjustment) {
      return false;
    }

    adjustment.isDeleted = true;
    adjustment.updatedByUserId = params.userId;
    adjustment.updatedOn = new Date();

    await this.repository.save(adjustment);
    return true;
  }
}
