import { Injectable } from '@nestjs/common';
import { formatLegacyDate } from 'src/utils/date-utils';

@Injectable()
export class PaymentsReportTransformationService {
  transformDetailRows(rows: any[]) {
    return rows.map((r: any) => {
      const fullName = `${r.firstName || ''} ${r.lastName || ''}`.trim();
      return {
        paymentId: `P-${String(r.paymentId)}`,
        paymentDate: formatLegacyDate(new Date(r.paymentDate)),
        amount: parseFloat(r.amount || 0).toFixed(2),
        paymentMethodId: r.paymentMethodId,
        paymentMethodName: r.paymentMethodName,
        customer: fullName || r.publicIdentity || '',
        userId: String(r.userId),
        reference: r.paymentReference || '',
        students: r.studentNames || '',
      };
    });
  }

  transformSummaryRows(rows: any[]) {
    return rows.map((r: any) => ({
      paymentDate: r.paymentDateLabel,
      paymentMethod: r.paymentMethodName,
      amount: parseFloat(r.amount || 0).toFixed(2),
    }));
  }
}


