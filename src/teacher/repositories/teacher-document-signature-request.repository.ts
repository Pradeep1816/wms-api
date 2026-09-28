import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TeacherDocumentSignatureRequest,
  TeacherDocumentSignatureRequestStatus,
  TeacherDocumentSignatureRequestType,
} from '../entities/teacher-document-signature-request.entity';

interface TeacherDocumentSignatureRequestLookupParams {
  locationId: number;
  teacherId: number;
  documentType: TeacherDocumentSignatureRequestType;
  startDate: string;
  endDate: string;
  summaryOnly: boolean;
}

interface TeacherDocumentSignatureRequestRangeParams {
  locationId: number;
  documentType: TeacherDocumentSignatureRequestType;
  startDate: string;
  endDate: string;
}

interface TeacherDocumentAnnualInvoiceHistoryParams {
  locationId: number;
  startDate: string;
  endDate: string;
  teacherId?: number;
}

@Injectable()
export class TeacherDocumentSignatureRequestRepository {
  constructor(
    @InjectRepository(TeacherDocumentSignatureRequest)
    private readonly repository: Repository<TeacherDocumentSignatureRequest>,
  ) {}

  findActiveRequest(
    params: TeacherDocumentSignatureRequestLookupParams,
  ): Promise<TeacherDocumentSignatureRequest | null> {
    return this.repository.findOne({
      where: {
        locationId: params.locationId,
        teacherId: params.teacherId,
        documentType: params.documentType,
        startDate: params.startDate,
        endDate: params.endDate,
        summaryOnly: params.summaryOnly,
        isDeleted: false,
      },
      order: {
        id: 'DESC',
      },
    });
  }

  findSignedOverlappingRequests(
    params: TeacherDocumentSignatureRequestLookupParams,
  ): Promise<TeacherDocumentSignatureRequest[]> {
    return this.repository
      .createQueryBuilder('request')
      .where('request.locationId = :locationId', {
        locationId: params.locationId,
      })
      .andWhere('request.teacherId = :teacherId', {
        teacherId: params.teacherId,
      })
      .andWhere('request.documentType = :documentType', {
        documentType: params.documentType,
      })
      .andWhere('request.status = :status', {
        status: TeacherDocumentSignatureRequestStatus.SIGNED,
      })
      .andWhere('request.startDate <= :endDate', {
        endDate: params.endDate,
      })
      .andWhere('request.endDate >= :startDate', {
        startDate: params.startDate,
      })
      .andWhere(
        'NOT (request.startDate = :startDate AND request.endDate = :endDate)',
        {
          startDate: params.startDate,
          endDate: params.endDate,
        },
      )
      .andWhere('request.isDeleted = false')
      .orderBy('request.startDate', 'ASC')
      .addOrderBy('request.endDate', 'ASC')
      .addOrderBy('request.id', 'DESC')
      .limit(10)
      .getMany();
  }

  findLatestSignedRequest(
    params: TeacherDocumentSignatureRequestLookupParams,
  ): Promise<TeacherDocumentSignatureRequest | null> {
    return this.repository.findOne({
      where: {
        locationId: params.locationId,
        teacherId: params.teacherId,
        documentType: params.documentType,
        startDate: params.startDate,
        endDate: params.endDate,
        summaryOnly: params.summaryOnly,
        status: TeacherDocumentSignatureRequestStatus.SIGNED,
        isDeleted: false,
      },
      order: {
        id: 'DESC',
      },
    });
  }

  async findLatestSignedRequestWithSummaryFallback(
    params: TeacherDocumentSignatureRequestLookupParams,
  ): Promise<TeacherDocumentSignatureRequest | null> {
    const exactRequest = await this.findLatestSignedRequest(params);

    if (exactRequest) {
      return exactRequest;
    }

    return this.findLatestSignedRequest({
      ...params,
      summaryOnly: !params.summaryOnly,
    });
  }

  createRequest(params: {
    locationId: number;
    teacherId: number;
    documentType: TeacherDocumentSignatureRequestType;
    startDate: string;
    endDate: string;
    summaryOnly: boolean;
    requestedByUserId: number;
    disclosureSnapshot?: string | null;
    documentDataSnapshot?: string | null;
  }): Promise<TeacherDocumentSignatureRequest> {
    const now = new Date();
    const request = this.repository.create({
      ...params,
      status: TeacherDocumentSignatureRequestStatus.PENDING,
      requestedAt: now,
      createdOn: now,
      updatedOn: now,
      isDeleted: false,
    });

    return this.repository.save(request);
  }

  findForTeacher(
    locationId: number,
    teacherId: number,
  ): Promise<TeacherDocumentSignatureRequest[]> {
    return this.repository.find({
      where: {
        locationId,
        teacherId,
        isDeleted: false,
      },
      order: {
        requestedAt: 'DESC',
        id: 'DESC',
      },
    });
  }

  findByIdForTeacher(
    id: number,
    locationId: number,
    teacherId: number,
  ): Promise<TeacherDocumentSignatureRequest | null> {
    return this.repository.findOne({
      where: {
        id,
        locationId,
        teacherId,
        isDeleted: false,
      },
    });
  }

  findByIdForLocation(
    id: number,
    locationId: number,
  ): Promise<TeacherDocumentSignatureRequest | null> {
    return this.repository.findOne({
      where: {
        id,
        locationId,
        isDeleted: false,
      },
    });
  }

  async findLatestByRangeForTracking(
    params: TeacherDocumentSignatureRequestRangeParams,
  ): Promise<TeacherDocumentSignatureRequest[]> {
    return this.repository
      .createQueryBuilder('request')
      .innerJoin(
        (subQuery) =>
          subQuery
            .select('latest.teacherId', 'teacherId')
            .addSelect('latest.summaryOnly', 'summaryOnly')
            .addSelect('latest.startDate', 'startDate')
            .addSelect('latest.endDate', 'endDate')
            .addSelect('MAX(latest.id)', 'id')
            .from(TeacherDocumentSignatureRequest, 'latest')
            .where('latest.locationId = :locationId', {
              locationId: params.locationId,
            })
            .andWhere('latest.documentType = :documentType', {
              documentType: params.documentType,
            })
            .andWhere('latest.startDate >= :startDate', {
              startDate: params.startDate,
            })
            .andWhere('latest.endDate <= :endDate', {
              endDate: params.endDate,
            })
            .andWhere('latest.isDeleted = false')
            .groupBy('latest.teacherId')
            .addGroupBy('latest.summaryOnly')
            .addGroupBy('latest.startDate')
            .addGroupBy('latest.endDate'),
        'latest_request',
        'latest_request.id = request.id',
      )
      .where('request.locationId = :locationId', {
        locationId: params.locationId,
      })
      .andWhere('request.documentType = :documentType', {
        documentType: params.documentType,
      })
      .andWhere('request.startDate >= :startDate', {
        startDate: params.startDate,
      })
      .andWhere('request.endDate <= :endDate', { endDate: params.endDate })
      .andWhere('request.isDeleted = false')
      .orderBy('request.startDate', 'ASC')
      .addOrderBy('request.endDate', 'ASC')
      .addOrderBy('request.teacherId', 'ASC')
      .addOrderBy('request.summaryOnly', 'ASC')
      .getMany();
  }

  /**
   * All non-deleted requests for one location + document type over an exact
   * period. The date match is done in SQL (not in JS) because `date` columns
   * come back from the driver as Date objects, so a JS string comparison
   * against a 'YYYY-MM-DD' query value would never match. Used by the batch
   * preflight to decide who is already signed/pending for the period.
   */
  findByExactPeriodForLocation(params: {
    locationId: number;
    documentType: TeacherDocumentSignatureRequestType;
    startDate: string;
    endDate: string;
  }): Promise<TeacherDocumentSignatureRequest[]> {
    return this.repository.find({
      where: {
        locationId: params.locationId,
        documentType: params.documentType,
        startDate: params.startDate,
        endDate: params.endDate,
        isDeleted: false,
      },
      order: {
        id: 'DESC',
      },
    });
  }

  async findAnnualInvoiceHistoryRequests(
    params: TeacherDocumentAnnualInvoiceHistoryParams,
  ): Promise<TeacherDocumentSignatureRequest[]> {
    const query = this.repository
      .createQueryBuilder('request')
      .where('request.locationId = :locationId', {
        locationId: params.locationId,
      })
      .andWhere('request.documentType = :documentType', {
        documentType: TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
      })
      .andWhere('request.startDate >= :startDate', {
        startDate: params.startDate,
      })
      .andWhere('request.endDate <= :endDate', { endDate: params.endDate })
      .andWhere('request.isDeleted = false');

    if (params.teacherId) {
      query.andWhere('request.teacherId = :teacherId', {
        teacherId: params.teacherId,
      });
    }

    return query.orderBy('request.id', 'DESC').getMany();
  }

  async markVoided(
    request: TeacherDocumentSignatureRequest,
    params: { voidedByUserId: number; reason: string },
  ): Promise<TeacherDocumentSignatureRequest> {
    const now = new Date();
    request.status = TeacherDocumentSignatureRequestStatus.VOID;
    request.voidedByUserId = params.voidedByUserId;
    request.voidedAt = now;
    request.voidReason = params.reason;
    request.updatedOn = now;

    return this.repository.save(request);
  }

  async markReminded(
    request: TeacherDocumentSignatureRequest,
  ): Promise<TeacherDocumentSignatureRequest> {
    const now = new Date();
    request.lastRemindedAt = now;
    request.updatedOn = now;

    return this.repository.save(request);
  }

  async markSigned(
    request: TeacherDocumentSignatureRequest,
    signedByUserId: number,
  ): Promise<TeacherDocumentSignatureRequest> {
    const now = new Date();
    request.status = TeacherDocumentSignatureRequestStatus.SIGNED;
    request.signedByUserId = signedByUserId;
    request.signedAt = now;
    request.updatedOn = now;

    return this.repository.save(request);
  }

  // for teacher to reject a time voucher request
  async markRejected(
    request: TeacherDocumentSignatureRequest,
    reason: string,
  ): Promise<TeacherDocumentSignatureRequest> {
    const now = new Date();
    request.status = TeacherDocumentSignatureRequestStatus.REJECTED;
    request.rejection_reason = reason;
    request.updatedOn = now;

    return this.repository.save(request)
  }

  async markElectronicallySigned(
    request: TeacherDocumentSignatureRequest,
    params: {
      signedByUserId: number;
      signerName: string;
      signatureDataUrl?: string | null;
    },
  ): Promise<TeacherDocumentSignatureRequest> {
    const now = new Date();
    request.status = TeacherDocumentSignatureRequestStatus.SIGNED;
    request.signedByUserId = params.signedByUserId;
    request.signedAt = now;
    request.signedSignerName = params.signerName;
    request.signedSignatureDataUrl = params.signatureDataUrl || null;
    request.updatedOn = now;

    return this.repository.save(request);
  }
}
