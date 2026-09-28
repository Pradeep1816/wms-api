import { Injectable } from '@nestjs/common';
import { formatDate } from '../../../utils/date-utils';

@Injectable()
export class ReleaseNotesTransformationService {
  
  transformRow(row: any) {
    const firstname = row.firstname || '';
    const lastname = row.lastname || '';

    return {
      id: Number(row.id),
      subject: String(row.subject || ''),
      summary: String(row.summary || ''),
      notes: String(row.notes || ''),
      releaseVersion: String(row.version || ''), // Map version to releaseVersion for frontend

      scheduleDate: formatDate(row.scheduleDate),
      date: formatDate(row.date),

      userId: Number(row.userId),

      userPublicIdentity: `${firstname} ${lastname}`.trim(),   // 🔥 Added

      isRead: row.isRead ? true : false,
      isDeleted: false,
    };
  }

  transformRows(items: any[], page: number, limit: number, total: number) {
    const transformedRows = items.map((item) => this.transformRow(item));

    return {
      body: transformedRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
