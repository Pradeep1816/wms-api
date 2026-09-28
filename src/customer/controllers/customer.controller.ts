import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards, ValidationPipe, Req } from '@nestjs/common';
import { CustomerListRequestDto, CreateCustomerRequestDto } from '../dto/customer-request.dto';
import { CustomerListResponseDto } from '../dto/customer-response.dto';
import { EmailStatementResponseDto } from '../dto/email-statement-response.dto';
import { CustomerPaymentsRequestDto } from '../../payment/dto/payment-request.dto';
import { CustomerPaymentsListResponseDto } from '../../payment/dto/payment-response.dto';
import { CustomerService } from '../services/customer.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CustomerStudentsRequestDto } from '../../student/dto/customer-students-request.dto';
import { CustomerStudentsResponseDto } from '../../student/dto/customer-students-response.dto';
import { StudentService } from '../../student/services/student.service';
import { CustomerEnrolmentsRequestDto } from '../../enrolment/dto/customer-enrolments-request.dto';
import { CustomerEnrolmentsResponseDto } from '../../enrolment/dto/customer-enrolments-response.dto';
import { EnrolmentService } from '../../enrolment/services/enrolment.service';
import { PrivateLessonRequestDto } from '../../lesson/dto/private-lesson-request.dto';
import { PrivateLessonsResponseDto } from '../../lesson/dto/private-lesson-response.dto';
import { PrivateLessonService } from '../../lesson/services/private-lesson.service';
import { GroupLessonRequestDto } from '../../lesson/dto/group-lesson-request.dto';
import { GroupLessonsResponseDto } from '../../lesson/dto/group-lesson-response.dto';
import { GroupLessonService } from '../../lesson/services/group-lesson.service';
import { GroupLessonDueRequestDto } from '../../lesson/dto/group-lesson-due-request.dto';
import { GroupLessonDueResponseDto } from '../../lesson/dto/group-lesson-due-response.dto';
import { GroupLessonDueService } from '../../lesson/services/group-lesson-due.service';
import { PrivateLessonDueRequestDto } from '../../lesson/dto/private-lesson-due-request.dto';
import { PrivateLessonDueResponseDto } from '../../lesson/dto/private-lesson-due-response.dto';
import { PrivateLessonDueService } from '../../lesson/services/private-lesson-due.service';
import { ProFormaInvoiceRequestDto } from '../../invoice/dto/pro-forma-invoice-request.dto';
import { ProFormaInvoicesResponseDto } from '../../invoice/dto/pro-forma-invoice-response.dto';
import { ProFormaInvoiceService } from '../../invoice/services/pro-forma-invoice.service';
import { OutstandingInvoiceRequestDto } from '../../invoice/dto/outstanding-invoice-request.dto';
import { OutstandingInvoicesResponseDto } from '../../invoice/dto/outstanding-invoice-response.dto';
import { OutstandingInvoiceService } from '../../invoice/services/outstanding-invoice.service';
import { CommentService } from '../../comment/services/comment.service';
import { CommentsRequestDto } from '../../comment/dto/comment-request.dto';
import { CommentsResponseDto } from '../../comment/dto/comment-response.dto';
import { PaymentService } from '../../payment/services/payment.service';
import { EquipmentRentalRequestDto } from '../../equipment-rental/dto/equipment-rental-request.dto';
import { EquipmentRentalModalRequestDto } from '../../equipment-rental/dto/equipment-rental-modal-request.dto';
import { EquipmentRentalDataDto } from '../../equipment-rental/dto/equipment-rental-response.dto';
import { EquipmentRentalService } from '../../equipment-rental/services/equipment-rental.service';
import { CustomerRecurringPaymentService } from '../../recurring-payment/services/customer-recurring-payment.service';
import { CustomerRecurringPaymentRequestDto } from '../../recurring-payment/dto/customer-recurring-payment-request.dto';
import { CustomerRecurringPaymentInfoRequestDto } from '../../recurring-payment/dto/customer-recurring-payment-info-request.dto';
import { CustomerRecurringPaymentsResponseDto } from '../../recurring-payment/dto/customer-recurring-payment-response.dto';
import { RecurringPaymentInfoResponseDto } from '../../recurring-payment/dto/customer-recurring-payment-info-response.dto';
import { CustomerInvoiceService } from '../../invoice/services/customer-invoice.service';
import { CustomerInvoiceRequestDto } from '../../invoice/dto/customer-invoice-request.dto';
import { CustomerInvoicesDataDto } from '../../invoice/dto/customer-invoice-response.dto';
import { ReceivePaymentInvoiceService } from '../../invoice/services/receive-payment-invoice.service';
import { ReceivePaymentInvoiceRequestDto } from '../../invoice/dto/receive-payment-invoice-request.dto';
import { ReceivePaymentInvoiceResponseDto } from '../../invoice/dto/receive-payment-invoice-response.dto';
import { ReceivePaymentGroupLessonService } from '../../lesson/services/receive-payment-group-lesson.service';
import { ReceivePaymentGroupLessonRequestDto } from '../../lesson/dto/receive-payment-group-lesson-request.dto';
import { ReceivePaymentGroupLessonResponseDto } from '../../lesson/dto/receive-payment-group-lesson-response.dto';
import { ReceivePaymentLessonService } from '../../lesson/services/receive-payment-lesson.service';
import { ReceivePaymentLessonRequestDto } from '../../lesson/dto/receive-payment-lesson-request.dto';
import { ReceivePaymentLessonResponseDto } from '../../lesson/dto/receive-payment-lesson-response.dto';
import {ReceicePaymentsCreditsResponseDto } from '../../payment/dto/receice-payments-credits-response.dto';
import { ReceicePaymentsCreditsRequestDto } from '../../payment/dto/receice-payments-credits-request.dto';
import { ReceicePaymentCreditService } from '../../payment/services/receice-payment-credit.service';
import { ReceiceInvoiceCreditsResponseDto } from 'src/invoice/dto/receive-invoice-credit-response.dto';
import { ReceivePaymentInvoiceCreditService } from 'src/invoice/services/receive-payment-invoice-credit.service';
import { ReceiveInvoiceCreditRequestDto } from 'src/invoice/dto/receive-invoice-credit.request.dto';
import { NotifyEmailRequestDto } from '../dto/notify-email-request.dto';
import { NotifyEmailPreviewResponseDto, NotifyEmailUpdateResponseDto } from '../dto/notify-email-response.dto';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly studentService: StudentService,
    private readonly enrolmentService: EnrolmentService,
    private readonly privateLessonService: PrivateLessonService,
    private readonly groupLessonService: GroupLessonService,
    private readonly groupLessonDueService: GroupLessonDueService,
    private readonly privateLessonDueService: PrivateLessonDueService,
    private readonly proFormaInvoiceService: ProFormaInvoiceService,
    private readonly outstandingInvoiceService: OutstandingInvoiceService,
    private readonly commentService: CommentService,
    private readonly paymentService: PaymentService,
    private readonly equipmentRentalService: EquipmentRentalService,
    private readonly customerRecurringPaymentService: CustomerRecurringPaymentService,
    private readonly customerInvoiceService: CustomerInvoiceService,
    private readonly receivePaymentInvoiceService: ReceivePaymentInvoiceService,
    private readonly receivePaymentGroupLessonService: ReceivePaymentGroupLessonService,
    private readonly receivePaymentLessonService: ReceivePaymentLessonService,
    private readonly receivePaymentCreditService: ReceicePaymentCreditService,
    private readonly receivePaymentInvoiceCreditService: ReceivePaymentInvoiceCreditService,
  ) {}

  @Get()
  @Roles(RolesEnum.BACKEND_USER) // API Access allowed for backend users
  async getCustomers(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: CustomerListRequestDto,
  ): Promise<CustomerListResponseDto | any> {
    try {
      const result = await this.customerService.getCustomers(locationSlug, query);
      return ResponseHelper.success(result, 'Customers list retrieved successfully');
    } catch (error) {
      console.error('Error in getCustomers controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customers');
    }
  
  }

  @Get(':id/summary')
  @Roles(RolesEnum.BACKEND_USER)
  async getCustomerSummary(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ): Promise<any> {
    try {
      const result = await this.customerService.getCustomerSummary(locationSlug, customerId);
      return ResponseHelper.success(result, 'Customer summary retrieved successfully');
    } catch (error) {
      console.error('Error in getCustomerSummary controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customer summary');
    }
  }


  @Get(':id/students')
  @Roles(RolesEnum.BACKEND_USER)
  async getStudentsByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerStudentsRequestDto,
  ): Promise<CustomerStudentsResponseDto | any> {
    try {
      const result = await this.studentService.getStudentsByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Students retrieved successfully');
    } catch (error) {
      console.error('Error in getStudentsByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve students');
    }
  }

  @Get(':id/enrolments')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentsByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerEnrolmentsRequestDto,
  ): Promise<CustomerEnrolmentsResponseDto | any> {
    try {
      const result = await this.enrolmentService.getEnrolmentsByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Enrolments retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentsByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve enrolments');
    }
  }

  @Get(':id/private-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPrivateLessonsByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: PrivateLessonRequestDto,
  ): Promise<PrivateLessonsResponseDto | any> {
    try {
      const result = await this.privateLessonService.getPrivateLessonsByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Private lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getPrivateLessonsByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve private lessons');
    }
  }

  @Get(':id/group-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupLessonsByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: GroupLessonRequestDto,
  ): Promise<GroupLessonsResponseDto | any> {
    try {
      const result = await this.groupLessonService.getGroupLessonsByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Group lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupLessonsByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve group lessons');
    }
  }

  @Get(':id/group-lesson-dues')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupLessonDuesByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: GroupLessonDueRequestDto,
  ): Promise<GroupLessonDueResponseDto | any> {
    try {
      const result = await this.groupLessonDueService.getGroupLessonDuesByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Group lesson dues retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupLessonDuesByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve group lesson dues');
    }
  }

  @Get(':id/private-lesson-due')
  @Roles(RolesEnum.BACKEND_USER)
  async getPrivateLessonDuesByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: PrivateLessonDueRequestDto,
  ): Promise<PrivateLessonDueResponseDto | any> {
    try {
      const result = await this.privateLessonDueService.getPrivateLessonDuesByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Private lesson dues retrieved successfully');
    } catch (error) {
      console.error('Error in getPrivateLessonDuesByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve private lesson dues');
    }
  }

  @Get(':id/pro-forma-invoices')
  @Roles(RolesEnum.BACKEND_USER)
  async getProFormaInvoicesByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: ProFormaInvoiceRequestDto,
  ): Promise<ProFormaInvoicesResponseDto | any> {
    try {
      const result = await this.proFormaInvoiceService.getProFormaInvoicesByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Pro-forma invoices retrieved successfully');
    } catch (error) {
      console.error('Error in getProFormaInvoicesByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve pro-forma invoices');
    }
  }

  @Get(':id/outstanding-invoices')
  @Roles(RolesEnum.BACKEND_USER)
  async getOutstandingInvoicesByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: OutstandingInvoiceRequestDto,
  ): Promise<OutstandingInvoicesResponseDto | any> {
    try {
      const result = await this.outstandingInvoiceService.getOutstandingInvoicesByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Outstanding invoices retrieved successfully');
    } catch (error) {
      console.error('Error in getOutstandingInvoicesByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve outstanding invoices');
    }
  }
// This is outdated and will be removed
  @Get(':id/comments')
  @Roles(RolesEnum.BACKEND_USER)
  async getCommentByCustomerId(
    @Param(ValidationPipe) params: CommentsRequestDto,
  ): Promise<CommentsResponseDto | any> {
    try {
      const result = await this.commentService.getCommentsByCustomerId(
        params.location,
        parseInt(params.id),
      );
      return ResponseHelper.success(result, 'Comments retrieved successfully');
    } catch (error) {
      console.error('Error in getCommentsByUserId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve comments');
    }
  }

  @Get(':id/notify-email-preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getNotifyEmailPreview(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ): Promise<NotifyEmailPreviewResponseDto | any> {
    try {
      const result = await this.customerService.getNotificationEmailTypes(locationSlug, customerId);
      return ResponseHelper.success(result, 'Notification email types retrieved successfully');
    } catch (error) {
      console.error('Error in getNotifyEmailPreview controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve notification email types');
    }
  }

  @Get(':id')
  @Roles(RolesEnum.BACKEND_USER)
  async getCustomerById(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ) {
    try {
      const customer = await this.customerService.getCustomerById(customerId, locationSlug);
      return ResponseHelper.success(customer, 'Customer details retrieved successfully');
    } catch (error) {
      console.error('Error in getCustomerById controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customer details');
    }
  }

  @Post()
  @Roles(RolesEnum.BACKEND_USER)
  async createCustomer(
    @Param('location') locationSlug: string,
    @Body(ValidationPipe) createCustomerDto: CreateCustomerRequestDto,
    @Req() req: any,
  ) {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }
      const customer = await this.customerService.createCustomer(
        locationSlug,
        createCustomerDto,
        currentUserId,
      );
      return ResponseHelper.success(customer, 'Customer created successfully');
    } catch (error) {
      console.error('Error in createCustomer controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create customer');
    }
  }  

  @Get(':id/payments')
  @Roles(RolesEnum.BACKEND_USER)
  async getCustomerPayments(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerPaymentsRequestDto,
  ): Promise<CustomerPaymentsListResponseDto | any> {
    try {
      const result = await this.paymentService.getCustomerPayments(customerId, locationSlug, query);
      return ResponseHelper.success(result, 'Customer payments retrieved successfully');
    } catch (error) {
      console.error('Error in getCustomerPayments controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customer payments');
    }
  }

  @Get(':id/equipment-rentals')
  @Roles(RolesEnum.BACKEND_USER)
  async getEquipmentRentalsByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: EquipmentRentalRequestDto,
  ): Promise<EquipmentRentalDataDto | any> {
    try {
      const result = await this.equipmentRentalService.getEquipmentRentalsByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Equipment rentals retrieved successfully');
    } catch (error) {
      console.error('Error in getEquipmentRentalsByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve equipment rentals');
    }
  }

  @Get(':id/equipment-rentals/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getEquipmentRentalsModalData(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: EquipmentRentalModalRequestDto,
  ): Promise<any> {
    try {
      const result = await this.equipmentRentalService.getEquipmentRentalsModalData(locationSlug, customerId, query);
      return ResponseHelper.success(result, 'Equipment rentals modal data retrieved successfully');
    } catch (error) {
      console.error('Error in getEquipmentRentalsModalData controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve equipment rentals modal data');
    }
  }

  @Get(':id/recurring-payments')
  @Roles(RolesEnum.BACKEND_USER)
  async getRecurringPaymentsByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerRecurringPaymentRequestDto,
  ): Promise<CustomerRecurringPaymentsResponseDto | any> {
    try {
      const result = await this.customerRecurringPaymentService.getRecurringPaymentsByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Recurring payments retrieved successfully');
    } catch (error) {
      console.error('Error in getRecurringPaymentsByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve recurring payments');
    }
  }

  @Get(':id/recurring-payments/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getRecurringPaymentInfo(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerRecurringPaymentInfoRequestDto,
  ): Promise<RecurringPaymentInfoResponseDto | any> {
    try {
      const result = await this.customerRecurringPaymentService.getRecurringPaymentInfo(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Recurring payment form data retrieved successfully');
    } catch (error) {
      console.error('Error in getRecurringPaymentInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve recurring payment form data');
    }
  }

  @Get(':id/invoices')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoicesByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerInvoiceRequestDto,
  ): Promise<CustomerInvoicesDataDto | any> {
    try {
      const result = await this.customerInvoiceService.getInvoicesByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Customer invoices retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoicesByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customer invoices');
    }
  }
  
  @Get(':id/receive-payment-invoice')
  @Roles(RolesEnum.BACKEND_USER)
  async receivePaymentForInvoice(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: ReceivePaymentInvoiceRequestDto,
  ): Promise<ReceivePaymentInvoiceResponseDto | any> {
    try {
      const result = await this.receivePaymentInvoiceService.receivePaymentForInvoice(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Received payment invoices retrieved successfully');
    } catch (error) {
      console.error('Error in receivePaymentForInvoice controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('already') || error.message.includes('exceed')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to process payment');
    }
  }

  @Get(':id/receive-payment-group-lesson')
  @Roles(RolesEnum.BACKEND_USER)
  async receivePaymentForGroupLesson(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: ReceivePaymentGroupLessonRequestDto,
  ): Promise<ReceivePaymentGroupLessonResponseDto | any> {
    try {
      const result = await this.receivePaymentGroupLessonService.receivePaymentForGroupLesson(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Payment received for group lessons successfully');
    } catch (error) {
      console.error('Error in receivePaymentForGroupLesson controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('already') || error.message.includes('exceed')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to process group lesson payment');
    }
  }

  @Get(':id/receive-payment-lesson')
  @Roles(RolesEnum.BACKEND_USER)
  async receivePaymentForLesson(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: ReceivePaymentLessonRequestDto,
  ): Promise<ReceivePaymentLessonResponseDto | any> {
    try {
      const result = await this.receivePaymentLessonService.receivePaymentForLesson(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Payment received for lessons successfully');
    } catch (error) {
      console.error('Error in receivePaymentForLesson controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('already') || error.message.includes('exceed')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to process lesson payment');
    }
  }

  @Get(':id/payment-credits')
  @Roles(RolesEnum.BACKEND_USER)
  async receivePaymentCredits(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: ReceicePaymentsCreditsRequestDto,
  ): Promise<ReceicePaymentsCreditsResponseDto | any> {
    try {
      const result = await this.receivePaymentCreditService.receivePaymentCredits(locationSlug, customerId, query);
      return ResponseHelper.success(result, 'Payment credits received successfully');
    } catch (error) {
      console.error('Error in receivePaymentCredits controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to receive payment credits');
    }
  }

  @Get(':id/invoice-credits')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoiceCredits(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: ReceiveInvoiceCreditRequestDto,
  ): Promise<ReceiceInvoiceCreditsResponseDto | any> {
    try {
      const result=await this.receivePaymentInvoiceCreditService.getInvoiceCredits(locationSlug, customerId, query);
      return ResponseHelper.success(result, 'Invoice credits retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoiceCredits controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve invoice credits');
    }
  }

  @Get(':id/customer-view')
  @Roles(RolesEnum.BACKEND_USER)
  async getCustomerView(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ): Promise<any> {
    try {
      const result = await this.customerService.getCustomerById(customerId, locationSlug);
      return ResponseHelper.success(result, 'Customer view retrieved successfully');
    }
     catch (error) {
      console.error('Error in getCustomerView controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customer view');
    }
  }

  @Delete(':id')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteCustomer(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ): Promise<any> {
    try {
      const result = await this.customerService.deleteCustomer(locationSlug, customerId);
      return ResponseHelper.success(result, 'Customer deleted successfully');
    } catch (error) {
      console.error('Error in deleteCustomer controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      // Handle validation errors (students, payments, etc.)
      if (error.message.includes('Unable to delete') || 
          error.message.includes('student') || 
          error.message.includes('payment') ||
          error.message.includes('associated')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to delete customer');
    }
  }

  @Post(':id/notify-email')
  @Roles(RolesEnum.BACKEND_USER)
  async updateNotifyEmail(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Body(ValidationPipe) notifyEmailDto: NotifyEmailRequestDto,
  ): Promise<NotifyEmailUpdateResponseDto | any> {
    try {
      const result = await this.customerService.updateNotificationEmailSettings(
        locationSlug,
        customerId,
        notifyEmailDto.emailNotifyType,
      );
      return ResponseHelper.success(result, 'Notification email settings updated successfully');
    } catch (error) {
      console.error('Error in updateNotifyEmail controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update notification email settings');
    }
  }

  @Get(':id/email-statement')
  @Roles(RolesEnum.BACKEND_USER)
  async getEmailStatement(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ): Promise<EmailStatementResponseDto | any> {
    try {
      const result = await this.customerService.getEmailStatementData(locationSlug, customerId);
      return ResponseHelper.success(result, 'Email statement data retrieved successfully');
    } catch (error) {
      console.error('Error in getEmailStatement controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve email statement data');
    }
  }

}
