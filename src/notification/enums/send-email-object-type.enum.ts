export enum EmailSendObjectTypeEnum {
  // Uses direct SMTP fallback in EmailSendService (mailerService.sendEmail)
  COURSE = 1,
  // Uses direct SMTP fallback in EmailSendService (mailerService.sendEmail)
  LESSON = 2,
  // Uses invoice flow in EmailSendService (invoiceEmailStatementService.sendInvoiceEmail)
  PFI = 3,
  // Uses invoice flow in EmailSendService (invoiceEmailStatementService.sendInvoiceEmail)
  INVOICE = 4,
  // Uses direct SMTP fallback in EmailSendService (mailerService.sendEmail)
  RECEIPT = 5,
  // Uses payment flow in EmailSendService (invoicePaymentEmailService.sendPaymentEmail)
  PAYMENT = 6,
  // Uses direct SMTP fallback in EmailSendService (mailerService.sendEmail)
  MESSAGE = 7,
  // Uses direct SMTP fallback in EmailSendService (mailerService.sendEmail)
  CUSTOMER_STATEMENT = 8,
  // Uses direct SMTP fallback in EmailSendService (mailerService.sendEmail)
  OVERDUE_LESSON = 9,
}
