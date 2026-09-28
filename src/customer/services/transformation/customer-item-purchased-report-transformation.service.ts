import { Injectable } from '@nestjs/common';
import { CustomerItemPurchasedReportRowDto } from '../../dto/customer-item-purchased-report-response.dto';

@Injectable()
export class CustomerItemPurchasedReportTransformationService {
  transformRow(row: any): CustomerItemPurchasedReportRowDto {
    return {
      id: Number(row.id),
      category_name: String(row.category_name || ''),
      description: String(row.description || ''),
      price: Number(row.net_total ?? 0).toFixed(2),
    };
  }

  transformRows(itemReportData: any[]) {
    let total = 0;
    const transformedRows = itemReportData.map((r) => {
      const netTotal = Number(r.net_total ?? 0);
      const roundedNetTotal = parseFloat(netTotal.toFixed(2));
      total += roundedNetTotal;
      return this.transformRow(r);
    });

    return {
      transformedRows,
      totalAmount: total.toFixed(2),
    };
  }
}

