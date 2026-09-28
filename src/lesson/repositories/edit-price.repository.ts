import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';
import { Invoice } from '../../invoice/entities/invoice.entity';

@Injectable()
export class EditPriceRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Get invoiced lesson IDs from the given list
   * Matches pattern from edit-classroom.repository.ts
   */
  async getInvoicedLessonIds(lessonIds: number[]): Promise<number[]> {
    if (!lessonIds?.length) return [];
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('iil.lessonId', 'lessonId')
      .from('invoice_item_lesson', 'iil')
      .innerJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId')
      .innerJoin('invoice', 'i', 'i.id = ili.invoice_id')
      .where('iil.lessonId IN (:...lessonIds)', { lessonIds })
      .andWhere('i.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('ili.isDeleted = :lineDeleted', { lineDeleted: false })
      .andWhere('ili.item_type_id = :privateLessonType', {
        privateLessonType: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      })
      .andWhere('i.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .getRawMany();
    return [...new Set((rows as { lessonId: number }[]).map((r) => r.lessonId))];
  }
}
