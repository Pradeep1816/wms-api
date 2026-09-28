import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, SelectQueryBuilder } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceListRequestDto } from '../dto/invoice-list-request.dto';
import { InvoiceType } from '../enums/invoice-type.enum';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { ItemTypeEnum } from '../enums/item-type.enum';

export interface InvoiceRawData {
  studentName?: string;
  phoneNumber?: string;
}

export interface InvoiceListResult {
  invoices: Invoice[];
  total: number;
  rawDataMap: Map<number, InvoiceRawData>;
}

// Filter configuration type
interface FilterConfig {
  field: string;
  value: () => string | number | undefined;
  apply: (query: SelectQueryBuilder<Invoice>, value: string | number) => void;
}

@Injectable()
export class InvoiceListRepository {
  private static readonly SORT_MAPPING: Record<string, string> = {
    number: 'invoice.invoiceNumber',
    customer: 'userProfile.firstname',
    student: 'customerStudent.first_name',
    date: 'invoice.date',  // Match legacy: ORDER BY date
  };

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  /**
   * Get invoices with filters and pagination
   * Based on legacy InvoiceSearch.php search() method
   */
  async getInvoices(
    locationId: number,
    searchDto: InvoiceListRequestDto,
  ): Promise<InvoiceListResult> {
    const {
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'DESC',
      showAll = false,
    } = searchDto;

    try {
      const query = this.buildBaseQuery(locationId);

      // Apply filters
      this.applyFilters(query, searchDto);
      this.applyDateRangeFilter(
        query,
        searchDto.fromDate,
        searchDto.toDate,
        !!searchDto.customerId,
      );
      this.applySorting(query, sort, order);
      query.groupBy('invoice.id');

      // Get total count before pagination
      const total = await query.getCount();

      // Apply pagination only if showAll is false
      if (!showAll) {
        const offset = (page - 1) * limit;
        query.offset(offset).limit(limit);
      }

      const invoices = await query.getMany();
      const rawDataMap = await this.getInvoiceDisplayData(invoices);

      return { invoices, total, rawDataMap };
    } catch (error) {
      console.error('Error in getInvoices repository:', error);
      throw new Error(
        `Failed to fetch invoices for location ${locationId}: ${error.message}`,
      );
    }
  }

  /**
   * Build the legacy-style list query. Display-only student/phone values are
   * batch-loaded after pagination to avoid changing row counts.
   */
  private buildBaseQuery(locationId: number): SelectQueryBuilder<Invoice> {
    return (
      this.invoiceRepository
        .createQueryBuilder('invoice')
        .leftJoinAndSelect('invoice.user', 'user')
        .leftJoinAndSelect('user.profile', 'userProfile')
        .leftJoin('user_contact','userContact','userContact.userId = user.id AND userContact.isDeleted = FALSE')
        .leftJoin('user_phone','userPhone','userPhone.userContactId = userContact.id')
        .leftJoin(
          'student',
          'customerStudent',
          'user.id = customerStudent.customer_id AND customerStudent.isDeleted = FALSE',
        )
        .where('invoice.locationId = :locationId', { locationId })
        .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
        .andWhere('invoice.type = :type', { type: InvoiceType.INVOICE })
    );
  }

  private async getInvoiceDisplayData(invoices: Invoice[]): Promise<Map<number, InvoiceRawData>> {
    const rawDataMap = new Map<number, InvoiceRawData>();
    if (!invoices.length) {
      return rawDataMap;
    }

    invoices.forEach((invoice) => rawDataMap.set(invoice.id, {}));

    const [phoneMap, lineItemStudentMap, customerStudentMap] = await Promise.all([
      this.getDisplayPhoneMap(invoices),
      this.getLineItemStudentMap(invoices),
      this.getCustomerStudentListMap(invoices),
    ]);

    invoices.forEach((invoice) => {
      const data = rawDataMap.get(invoice.id) ?? {};
      data.phoneNumber = phoneMap.get(invoice.id) || '';

      const lineItemStudent = lineItemStudentMap.get(invoice.id);
      const itemTypeId = Number(lineItemStudent?.itemTypeId);
      const shouldUseCustomerStudents =
        !invoice.isEquipmentRentalContract &&
        (!lineItemStudent?.lineItemId ||
          itemTypeId === ItemTypeEnum.TYPE_LESSON_CREDIT ||
          itemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE ||
          itemTypeId === ItemTypeEnum.TYPE_MISC);

      data.studentName = shouldUseCustomerStudents
        ? customerStudentMap.get(invoice.id) || ''
        : lineItemStudent?.studentName || '';

      rawDataMap.set(invoice.id, data);
    });

    return rawDataMap;
  }

  private async getDisplayPhoneMap(invoices: Invoice[]): Promise<Map<number, string>> {
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const rows = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('invoice.id', 'invoiceId')
      .addSelect(
        "SUBSTRING_INDEX(GROUP_CONCAT(userPhone.number ORDER BY userPhone.id ASC SEPARATOR ','), ',', 1)",
        'phoneNumber',
      )
      .from('invoice', 'invoice')
      .leftJoin('user_contact', 'userContact', 'userContact.userId = invoice.user_id AND userContact.isDeleted = FALSE')
      .leftJoin('user_phone', 'userPhone', 'userPhone.userContactId = userContact.id AND userPhone.isDeleted = FALSE')
      .where('invoice.id IN (:...invoiceIds)', { invoiceIds })
      .groupBy('invoice.id')
      .getRawMany();

    return new Map(rows.map((row) => [Number(row.invoiceId), row.phoneNumber || '']));
  }

  private async getLineItemStudentMap(
    invoices: Invoice[],
  ): Promise<Map<number, { lineItemId: number | null; itemTypeId: number | null; studentName: string }>> {
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const rows = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('invoice.id', 'invoiceId')
      .addSelect('lineItem.id', 'lineItemId')
      .addSelect('lineItem.item_type_id', 'itemTypeId')
      .addSelect(
        `
        CASE
          WHEN invoice.isEquipmentRentalContract = 1 THEN
            MAX(NULLIF(TRIM(CONCAT(COALESCE(rentalStudent.first_name, ''), ' ', COALESCE(rentalStudent.last_name, ''))), ''))
          ELSE
            COALESCE(
              MAX(NULLIF(TRIM(CONCAT(COALESCE(lineItemEnrolmentStudent.first_name, ''), ' ', COALESCE(lineItemEnrolmentStudent.last_name, ''))), '')),
              MAX(NULLIF(TRIM(CONCAT(COALESCE(paymentCycleStudent.first_name, ''), ' ', COALESCE(paymentCycleStudent.last_name, ''))), '')),
              MAX(NULLIF(TRIM(CONCAT(COALESCE(lessonStudent.first_name, ''), ' ', COALESCE(lessonStudent.last_name, ''))), ''))
            )
        END
        `,
        'studentName',
      )
      .from('invoice', 'invoice')
      .leftJoin(
        'invoice_line_item',
        'lineItem',
        `lineItem.id = (
          SELECT invoiceListLineItem.id
          FROM invoice_line_item invoiceListLineItem
          WHERE invoiceListLineItem.invoice_id = invoice.id
            AND invoiceListLineItem.isDeleted = FALSE
          ORDER BY invoiceListLineItem.id ASC
          LIMIT 1
        )`,
      )
      .leftJoin('invoice_item_enrolment', 'invoiceItemEnrolment', 'invoiceItemEnrolment.invoiceLineItemId = lineItem.id')
      .leftJoin('enrolment', 'lineItemEnrolment', 'lineItemEnrolment.id = invoiceItemEnrolment.enrolmentId AND lineItemEnrolment.isDeleted = FALSE')
      .leftJoin('student', 'lineItemEnrolmentStudent', 'lineItemEnrolmentStudent.id = lineItemEnrolment.studentId AND lineItemEnrolmentStudent.isDeleted = FALSE')
      .leftJoin('invoice_item_lesson', 'invoiceItemLesson', 'invoiceItemLesson.invoiceLineItemId = lineItem.id')
      .leftJoin('lesson', 'lineItemLesson', 'lineItemLesson.id = invoiceItemLesson.lessonId AND lineItemLesson.isDeleted = FALSE')
      .leftJoin('course', 'lineItemCourse', 'lineItemCourse.id = lineItemLesson.courseId AND lineItemCourse.isDeleted = FALSE')
      .leftJoin('enrolment', 'lessonEnrolment', 'lessonEnrolment.courseId = lineItemCourse.id AND invoiceItemEnrolment.id IS NULL AND lessonEnrolment.isDeleted = FALSE')
      .leftJoin('student', 'lessonStudent', 'lessonStudent.id = lessonEnrolment.studentId AND lessonStudent.isDeleted = FALSE')
      .leftJoin('invoice_item_payment_cycle_lesson', 'lineItemPaymentCycleLesson', 'lineItemPaymentCycleLesson.invoiceLineItemId = lineItem.id')
      .leftJoin('payment_cycle_lesson', 'paymentCycleLesson', 'paymentCycleLesson.id = lineItemPaymentCycleLesson.paymentCycleLessonId AND paymentCycleLesson.isDeleted = FALSE')
      .leftJoin('payment_cycle', 'paymentCycle', 'paymentCycle.id = paymentCycleLesson.paymentCycleId AND paymentCycle.isDeleted = FALSE')
      .leftJoin('enrolment', 'paymentCycleEnrolment', 'paymentCycleEnrolment.id = paymentCycle.enrolmentId AND paymentCycleEnrolment.isDeleted = FALSE')
      .leftJoin('student', 'paymentCycleStudent', 'paymentCycleStudent.id = paymentCycleEnrolment.studentId AND paymentCycleStudent.isDeleted = FALSE')
      .leftJoin('equipment_rental_invoice', 'equipmentRentalInvoice', 'equipmentRentalInvoice.invoiceId = invoice.id AND equipmentRentalInvoice.isDeleted = FALSE')
      .leftJoin('equipment_rentals', 'equipmentRental', 'equipmentRental.id = equipmentRentalInvoice.equipmentRentalsId AND equipmentRental.isDeleted = FALSE')
      .leftJoin('student', 'rentalStudent', 'rentalStudent.id = equipmentRental.studentId AND rentalStudent.isDeleted = FALSE')
      .where('invoice.id IN (:...invoiceIds)', { invoiceIds })
      .groupBy('invoice.id')
      .addGroupBy('lineItem.id')
      .addGroupBy('lineItem.item_type_id')
      .addGroupBy('invoice.isEquipmentRentalContract')
      .getRawMany();

    return new Map(
      rows.map((row) => [
        Number(row.invoiceId),
        {
          lineItemId: row.lineItemId ? Number(row.lineItemId) : null,
          itemTypeId: row.itemTypeId ? Number(row.itemTypeId) : null,
          studentName: row.studentName || '',
        },
      ]),
    );
  }

  private async getCustomerStudentListMap(invoices: Invoice[]): Promise<Map<number, string>> {
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const rows = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('invoice.id', 'invoiceId')
      .addSelect(
        `
        GROUP_CONCAT(
          DISTINCT NULLIF(TRIM(CONCAT(COALESCE(student.first_name, ''), ' ', COALESCE(student.last_name, ''))), '')
          ORDER BY student.id
          SEPARATOR ', '
        )
        `,
        'studentName',
      )
      .from('invoice', 'invoice')
      .leftJoin('student', 'student', 'student.customer_id = invoice.user_id AND student.isDeleted = FALSE')
      .where('invoice.id IN (:...invoiceIds)', { invoiceIds })
      .groupBy('invoice.id')
      .getRawMany();

    return new Map(rows.map((row) => [Number(row.invoiceId), row.studentName || '']));
  }

  /**
   * Apply all filters based on search DTO using filter configuration
   */
  private applyFilters(
    query: SelectQueryBuilder<Invoice>,
    searchDto: InvoiceListRequestDto,
  ): void {
    // Define filter configurations
    const filters: FilterConfig[] = [
      {
        field: 'number',
        value: () => searchDto.number?.trim(),
        apply: (q, val) =>
          q.andWhere('invoice.invoiceNumber LIKE :number', {
            number: `%${val}%`,
          }),
      },
      {
        field: 'customerId',
        value: () => searchDto.customerId,
        apply: (q, val) =>
          q.andWhere('invoice.userId = :customerId', {
            customerId: val,
          }),
      },
      {
        field: 'customer',
        value: () => (searchDto.customerId ? undefined : searchDto.customer?.trim()),
        apply: (q, val) =>
          q.andWhere(
            new Brackets((qb) => {
              const search = `%${val}%`;
              qb.where('userProfile.firstname LIKE :customerSearch', {
                customerSearch: search,
              })
                .orWhere('userProfile.lastname LIKE :customerSearch', {
                  customerSearch: search,
                })
                .orWhere(
                  "CONCAT(userProfile.firstname, ' ', userProfile.lastname) LIKE :customerSearch",
                  { customerSearch: search },
                );
            }),
          ),
      },
      {
        field: 'phone',
        value: () => searchDto.phone?.trim(),
        apply: (q, val) =>
          q.andWhere('userPhone.number LIKE :phone', {
            phone: `%${val}%`,
          }),
      },
      {
        field: 'student',
        value: () => searchDto.student?.trim(),
        apply: (q, val) =>
          q.andWhere(
            new Brackets((qb) => {
              const search = `%${val}%`;
              qb.where('customerStudent.first_name LIKE :studentSearch', {
                studentSearch: search,
              }).orWhere('customerStudent.last_name LIKE :studentSearch', {
                studentSearch: search,
              });
            }),
          ),
      },
    ];

    // Apply each filter if value exists
    filters.forEach(({ value, apply }) => {
      const val = value();
      if (val) apply(query, val);
    });

    // Apply status filter separately (has special logic)
    this.applyStatusFilter(query, searchDto.status);
  }

  /**
   * Apply invoice status filter
   */
  private applyStatusFilter(
    query: SelectQueryBuilder<Invoice>,
    status: number | undefined,
  ): void {
    // Skip if no status or ALL (6) selected
    if (!status || status === InvoiceStatus.ALL) return;

    // Status filter mapping
    const statusFilters: Record<number, () => void> = {
      [InvoiceStatus.VOID]: () => {
        query.andWhere('invoice.isVoid = :isVoid', { isVoid: 1 });
      },
      [InvoiceStatus.OWING]: () => this.applyNonVoidStatus(query, status),
      [InvoiceStatus.PAID]: () => this.applyNonVoidStatus(query, status),
      [InvoiceStatus.CREDIT]: () => this.applyNonVoidStatus(query, status),
    };

    const applyFilter = statusFilters[status];
    if (applyFilter) applyFilter();
  }

  /**
   * Apply non-void status filter
   */
  private applyNonVoidStatus(query: SelectQueryBuilder<Invoice>, status: number): void {
    query.andWhere('invoice.status = :status', { status });
    query.andWhere('invoice.isVoid = :isVoid', { isVoid: 0 });
  }

  private applyDateRangeFilter(
    query: SelectQueryBuilder<Invoice>,
    fromDate: string | undefined,
    toDate: string | undefined,
    skipDefaultDateRange: boolean = false,
  ): void {
    const trimmedFromDate = fromDate?.trim();
    const trimmedToDate = toDate?.trim();

    // Legacy parity: when both dates are provided, filter by DATE(invoice.date) inclusively.
    // This supports single-day searches when fromDate === toDate.
    if (trimmedFromDate && trimmedToDate) {
      const startDate = trimmedFromDate <= trimmedToDate ? trimmedFromDate : trimmedToDate;
      const endDate = trimmedFromDate <= trimmedToDate ? trimmedToDate : trimmedFromDate;

      query.andWhere('DATE(invoice.date) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
      return;
    }

    // If only fromDate is provided, use inclusive lower bound by date.
    if (trimmedFromDate) {
      query.andWhere('DATE(invoice.date) >= :startDate', {
        startDate: trimmedFromDate,
      });
      return;
    }

    // If only toDate is provided, use inclusive upper bound by date.
    if (trimmedToDate) {
      query.andWhere('DATE(invoice.date) <= :endDate', {
        endDate: trimmedToDate,
      });
      return;
    }

    if (skipDefaultDateRange) {
      return;
    }

    // Default: current month (as per DTO comment "default: This Month")
    // Format: YYYY-MM-01 to YYYY-MM-01 of next month (exclusive end) to match SQL query
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11 (0 = January, 11 = December)

    // First day of current month: YYYY-MM-01
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;

    // First day of next month (exclusive end): YYYY-MM-01
    const nextMonth = month === 11 ? 1 : month + 2;
    const nextYear = month === 11 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    query.andWhere('invoice.date >= :startDate', {
      startDate,
    });
    query.andWhere('invoice.date < :endDate', {
      endDate,
    });
  }

  /**
   * Apply sorting
   */
  private applySorting(
    query: SelectQueryBuilder<Invoice>,
    sort: string,
    order: string,
  ): void {
    const sortField = InvoiceListRepository.SORT_MAPPING[sort] || 'invoice.date';
    const sortOrder: 'ASC' | 'DESC' = order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query.orderBy(sortField, sortOrder);
  }
}
