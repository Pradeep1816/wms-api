import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

const POS_PAYMENT_MUTATION_ERROR =
  'Payments linked to completed POS sales cannot be edited or deleted. Reverse the sale from POS Payment History.';

export async function assertPaymentIsNotLinkedToPaidPos(
  manager: EntityManager,
  paymentId: number,
): Promise<void> {
  const rows = await manager.query(
    `
      SELECT id
      FROM pos_transaction
      WHERE (paymentId = ? AND status IN ('PAID', 'REFUNDED'))
         OR (refundPaymentId = ? AND status = 'REFUNDED')
      LIMIT 1
    `,
    [paymentId, paymentId],
  );

  if (rows.length > 0) {
    throw new BadRequestException(POS_PAYMENT_MUTATION_ERROR);
  }
}
