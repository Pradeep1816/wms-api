import { EntitySchema } from 'typeorm';
import { Classroom } from '../../../../src/classroom/entities/classroom.entity';
import { CalendarEventColor } from '../../../../src/color-code/entities/calendar-event-color.entity';
import { Course } from '../../../../src/course/entities/course.entity';
import { CourseExtra } from '../../../../src/course/entities/course-extra.entity';
import { CourseProgramRate } from '../../../../src/course/entities/course-program-rate.entity';
import { CourseSchedule } from '../../../../src/course/entities/course-schedule.entity';
import { CustomerAccount } from '../../../../src/customer/entities/customer-account.entity';
import { CustomerDiscount } from '../../../../src/customer/entities/customer-discount.entity';
import { NotificationEmailType } from '../../../../src/customer/entities/notification-email-type.entity';
import { Enrolment } from '../../../../src/enrolment/entities/enrolment.entity';
import { EnrolmentDiscount } from '../../../../src/enrolment/entities/enrolment-discount.entity';
import { EnrolmentPaymentFrequency } from '../../../../src/enrolment/entities/enrolment-payment-frequency.entity';
import { EquipmentRental } from '../../../../src/equipment-rental/entities/equipment-rental.entity';
import { PaymentCycleLesson } from '../../../../src/enrolment/entities/payment-cycle-lesson.entity';
import { Holiday } from '../../../../src/holiday/entities/holiday.entity';
import { Invoice } from '../../../../src/invoice/entities/invoice.entity';
import { InvoiceItemLesson } from '../../../../src/invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItem } from '../../../../src/invoice/entities/invoice-line-item.entity';
import { BulkRescheduleLesson } from '../../../../src/lesson/entities/bulk-reschedule-lesson.entity';
import { GroupLesson } from '../../../../src/lesson/entities/group-lesson.entity';
import { LessonDiscount } from '../../../../src/lesson/entities/lesson-discount.entity';
import { LessonHierarchy } from '../../../../src/lesson/entities/lesson-hierarchy.entity';
import { Lesson } from '../../../../src/lesson/entities/lesson.entity';
import { LessonPayment } from '../../../../src/lesson/entities/lesson-payment.entity';
import { LessonSplitUsage } from '../../../../src/lesson/entities/lesson-split-usage.entity';
import { PrivateLessonEmailStatus } from '../../../../src/lesson/entities/private-lesson-email-status.entity';
import { PrivateLesson } from '../../../../src/lesson/entities/private-lesson.entity';
import { Location } from '../../../../src/location/entities/location.entity';
import { CreditUsage } from '../../../../src/payment/entities/credit-usage.entity';
import { Payment } from '../../../../src/payment/entities/payment.entity';
import { PaymentCycle } from '../../../../src/payment/entities/payment-cycle.entity';
import { PaymentFrequency } from '../../../../src/payment/entities/payment-frequency.entity';
import { Program } from '../../../../src/program/entities/program.entity';
import { Qualification } from '../../../../src/qualification/entities/qualification.entity';
import { Student } from '../../../../src/student/entities/student.entity';
import { UserLocation } from '../../../../src/user/entities/user-location.entity';
import { UserProfile } from '../../../../src/user/entities/user-profile.entity';
import { User } from '../../../../src/user/entities/user.entity';

const dateColumn = { type: 'date' as const };
const dateTimeColumn = { type: 'datetime' as const };
const moneyColumn = { type: 'decimal' as const, precision: 10, scale: 4 };

export const privateEnrolmentEntitySchemas = [
  new EntitySchema<Classroom>({
    target: Classroom,
    name: 'Classroom',
    tableName: 'classroom',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      name: { type: String, length: 250, nullable: true },
      description: { type: 'text', nullable: true },
      locationId: { name: 'locationId', type: Number, unsigned: true },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
    },
  }),
  new EntitySchema<Location>({
    target: Location,
    name: 'Location',
    tableName: 'location',
    columns: {
      id: { type: Number, primary: true, unsigned: true },
      name: { type: String, length: 32 },
      address: { type: String, length: 64, default: '' },
      phoneNumber: { name: 'phone_number', type: String, length: 16, default: '' },
      email: { type: String, length: 255, nullable: true },
      cityId: { name: 'city_id', type: Number, unsigned: true, default: 0 },
      provinceId: { name: 'province_id', type: Number, unsigned: true, default: 0 },
      postalCode: { name: 'postal_code', type: String, length: 16, default: '' },
      countryId: { name: 'country_id', type: Number, unsigned: true, default: 0 },
      slug: { type: String, length: 30 },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
      isEnabledCron: { name: 'isEnabledCron', type: Boolean, default: false },
    },
  }),
  new EntitySchema<User>({
    target: User,
    name: 'User',
    tableName: 'user',
    columns: {
      id: { type: Number, primary: true, unsigned: true },
      username: { type: String, length: 32, nullable: true },
      auth_key: { type: String, length: 40, default: '' },
      access_token: { type: String, length: 40, default: '' },
      password_hash: { type: String, length: 255, nullable: true },
      pin_hash: { type: String, length: 128, nullable: true },
      oauth_client: { type: String, length: 255, nullable: true },
      oauth_client_user_id: { type: String, length: 255, nullable: true },
      status: { type: Number, default: 1 },
      canLogin: { type: Boolean, default: false },
      canMerge: { type: Boolean, default: false },
      isDeleted: { type: Boolean, default: false },
      created_at: { type: Number, nullable: true },
      updated_at: { type: Number, nullable: true },
      logged_at: { type: Number, nullable: true },
      login_token: { type: String, length: 50, nullable: true },
    },
    relations: {
      profile: {
        type: 'one-to-one',
        target: 'UserProfile',
        inverseSide: 'user',
      },
      userLocation: {
        type: 'one-to-one',
        target: 'UserLocation',
        inverseSide: 'user',
      },
      courses: {
        type: 'one-to-many',
        target: 'Course',
        inverseSide: 'teacher',
      },
      customerAccount: {
        type: 'one-to-one',
        target: 'CustomerAccount',
        inverseSide: 'user',
      },
      students: {
        type: 'one-to-many',
        target: 'Student',
        inverseSide: 'user',
      },
    },
  }),
  new EntitySchema<UserProfile>({
    target: UserProfile,
    name: 'UserProfile',
    tableName: 'user_profile',
    columns: {
      userId: { name: 'user_id', type: Number, primary: true, unsigned: true },
      firstname: { name: 'firstname', type: String, length: 255, nullable: true },
      middlename: { name: 'middlename', type: String, length: 255, nullable: true },
      lastname: { name: 'lastname', type: String, length: 255, nullable: true },
      avatarPath: { name: 'avatar_path', type: String, length: 255, nullable: true },
      avatarBaseUrl: { name: 'avatar_base_url', type: String, length: 255, nullable: true },
      locale: { name: 'locale', type: String, length: 32, nullable: true },
      gender: { name: 'gender', type: Number, nullable: true },
      birthDate: { name: 'birthDate', type: 'date', nullable: true },
    },
    relations: {
      user: {
        type: 'one-to-one',
        target: 'User',
        joinColumn: { name: 'user_id' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<CustomerAccount>({
    target: CustomerAccount,
    name: 'CustomerAccount',
    tableName: 'customer_account',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      customerId: { name: 'customerId', type: Number, unsigned: true },
      balance: { type: 'decimal', precision: 15, scale: 4, nullable: true },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
    },
    relations: {
      user: {
        type: 'one-to-one',
        target: 'User',
        joinColumn: { name: 'customerId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<UserLocation>({
    target: UserLocation,
    name: 'UserLocation',
    tableName: 'user_location',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      userId: { name: 'user_id', type: Number, unsigned: true },
      locationId: { name: 'location_id', type: Number, unsigned: true },
    },
    relations: {
      user: {
        type: 'one-to-one',
        target: 'User',
        inverseSide: 'userLocation',
        joinColumn: { name: 'user_id' },
        createForeignKeyConstraints: false,
      },
      location: {
        type: 'many-to-one',
        target: 'Location',
        joinColumn: { name: 'location_id' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<Student>({
    target: Student,
    name: 'Student',
    tableName: 'student',
    columns: {
      id: { type: Number, primary: true, unsigned: true },
      firstName: { name: 'first_name', type: String, length: 30 },
      lastName: { name: 'last_name', type: String, length: 30 },
      birthDate: { name: 'birth_date', type: 'date', nullable: true },
      customerId: { name: 'customer_id', type: Number, unsigned: true, nullable: true },
      status: { type: Number, unsigned: true },
      isDeleted: { name: 'isDeleted', type: Number, unsigned: true },
      gender: { type: String, length: 255 },
      note: { type: String, length: 255, nullable: true },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, unsigned: true },
      updatedByUserId: { name: 'updatedByUserId', type: Number, unsigned: true },
    },
    relations: {
      enrolments: {
        type: 'one-to-many',
        target: 'Enrolment',
        inverseSide: 'student',
      },
      user: {
        type: 'one-to-one',
        target: 'User',
        joinColumn: { name: 'customer_id' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<Program>({
    target: Program,
    name: 'Program',
    tableName: 'program',
    columns: {
      id: { type: Number, primary: true, unsigned: true },
      name: { type: String, length: 100 },
      publicName: { type: String, length: 100, nullable: true },
      pricingCategory: { type: String, length: 20, nullable: true },
      rate: { type: 'decimal', precision: 10, scale: 2, nullable: true },
      status: { type: Number, nullable: true, unsigned: true },
      type: { type: Number, unsigned: true },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
      createdByUserId: { name: 'createdByUserId', type: Number, unsigned: true },
      updatedByUserId: { name: 'updatedByUserId', type: Number, unsigned: true },
    },
    relations: {
      courses: {
        type: 'one-to-many',
        target: 'Course',
        inverseSide: 'program',
      },
    },
  }),
  new EntitySchema<Course>({
    target: Course,
    name: 'Course',
    tableName: 'course',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      programId: { name: 'programId', type: Number, unsigned: true },
      teacherId: { name: 'teacherId', type: Number, unsigned: true },
      locationId: { name: 'locationId', type: Number, unsigned: true },
      type: { type: Number, default: 1 },
      startDate: { name: 'startDate', ...dateTimeColumn },
      endDate: { name: 'endDate', ...dateTimeColumn, nullable: true },
      isConfirmed: { name: 'isConfirmed', type: Number, unsigned: true },
      lessonsCount: { name: 'lessonsCount', type: Number },
      isOnline: { name: 'is_online', type: Number, default: 0 },
      createdByUserId: { name: 'createdByUserId', type: Number },
      updatedByUserId: { name: 'updatedByUserId', type: Number },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
    },
    relations: {
      program: {
        type: 'many-to-one',
        target: 'Program',
        inverseSide: 'courses',
        joinColumn: { name: 'programId' },
        createForeignKeyConstraints: false,
      },
      lessons: {
        type: 'one-to-many',
        target: 'Lesson',
        inverseSide: 'course',
      },
      enrolments: {
        type: 'one-to-many',
        target: 'Enrolment',
        inverseSide: 'course',
      },
      teacher: {
        type: 'many-to-one',
        target: 'User',
        inverseSide: 'courses',
        joinColumn: { name: 'teacherId' },
        createForeignKeyConstraints: false,
      },
      courseSchedule: {
        type: 'one-to-many',
        target: 'CourseSchedule',
        inverseSide: 'course',
      },
      courseProgramRates: {
        type: 'one-to-many',
        target: 'CourseProgramRate',
        inverseSide: 'course',
      },
    },
  }),
  new EntitySchema<CourseExtra>({
    target: CourseExtra,
    name: 'CourseExtra',
    tableName: 'course_extra',
    columns: {
      id: { type: Number, primary: true, generated: true },
      courseId: { name: 'courseId', type: Number },
      extraCourseId: { name: 'extraCourseId', type: Number },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
    },
    relations: {
      course: {
        type: 'many-to-one',
        target: 'Course',
        joinColumn: { name: 'courseId' },
        createForeignKeyConstraints: false,
      },
      extraCourse: {
        type: 'many-to-one',
        target: 'Course',
        joinColumn: { name: 'extraCourseId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<CourseSchedule>({
    target: CourseSchedule,
    name: 'CourseSchedule',
    tableName: 'course_schedule',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      courseId: { name: 'courseId', type: Number, unsigned: true },
      day: { type: Number, unsigned: true },
      fromTime: { name: 'fromTime', type: 'time' },
      duration: { type: 'time' },
      startDate: { name: 'startDate', ...dateTimeColumn },
      endDate: { name: 'endDate', ...dateTimeColumn },
      teacherId: { name: 'teacherId', type: Number },
      isRecent: { name: 'isRecent', type: Boolean, nullable: true },
    },
    relations: {
      course: {
        type: 'many-to-one',
        target: 'Course',
        inverseSide: 'courseSchedule',
        joinColumn: { name: 'courseId' },
        createForeignKeyConstraints: false,
      },
      teacher: {
        type: 'many-to-one',
        target: 'User',
        joinColumn: { name: 'teacherId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<CourseProgramRate>({
    target: CourseProgramRate,
    name: 'CourseProgramRate',
    tableName: 'course_program_rate',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      courseId: { name: 'courseId', type: Number, unsigned: true },
      startDate: { name: 'startDate', ...dateColumn },
      endDate: { name: 'endDate', ...dateColumn },
      programRate: { name: 'programRate', type: 'decimal', precision: 10, scale: 2 },
      applyFullDiscount: { name: 'applyFullDiscount', type: Boolean },
    },
    relations: {
      course: {
        type: 'many-to-one',
        target: 'Course',
        inverseSide: 'courseProgramRates',
        joinColumn: { name: 'courseId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<CalendarEventColor>({
    target: CalendarEventColor,
    name: 'CalendarEventColor',
    tableName: 'calendar_event_color',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      name: { type: String, length: 50 },
      code: { type: String, length: 8 },
      cssClass: { type: String, length: 30 },
    },
  }),
  new EntitySchema<PaymentFrequency>({
    target: PaymentFrequency,
    name: 'PaymentFrequency',
    tableName: 'payment_frequency',
    columns: {
      id: { type: Number, primary: true, unsigned: true },
      name: { type: String, length: 20 },
      frequencyLength: { type: Number, unsigned: true },
    },
  }),
  new EntitySchema<Enrolment>({
    target: Enrolment,
    name: 'Enrolment',
    tableName: 'enrolment',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      courseId: { name: 'courseId', type: Number, unsigned: true },
      studentId: { name: 'studentId', type: Number, unsigned: true },
      isDeleted: { name: 'isDeleted', type: Boolean },
      endDateTime: { name: 'endDateTime', ...dateTimeColumn },
      paymentFrequencyId: { name: 'paymentFrequencyId', type: Number, unsigned: true },
      isConfirmed: { name: 'isConfirmed', type: Number, unsigned: true },
      isAutoRenew: { name: 'isAutoRenew', type: Number },
      isOnline: { name: 'is_online', type: Number, default: 0 },
      createdAt: { name: 'createdAt', ...dateTimeColumn, nullable: true },
      updatedAt: { name: 'updatedAt', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number },
      updatedByUserId: { name: 'updatedByUserId', type: Number },
      isEnableInfo: { name: 'isEnableInfo', type: Boolean, nullable: true },
      isEnableRescheduleInfo: { name: 'isEnableRescheduleInfo', type: Boolean, nullable: true },
    },
    relations: {
      course: {
        type: 'many-to-one',
        target: 'Course',
        inverseSide: 'enrolments',
        joinColumn: { name: 'courseId' },
        createForeignKeyConstraints: false,
      },
      student: {
        type: 'many-to-one',
        target: 'Student',
        inverseSide: 'enrolments',
        joinColumn: { name: 'studentId' },
        createForeignKeyConstraints: false,
      },
      paymentFrequency: {
        type: 'many-to-one',
        target: 'PaymentFrequency',
        joinColumn: { name: 'paymentFrequencyId' },
        createForeignKeyConstraints: false,
      },
      discounts: {
        type: 'one-to-many',
        target: 'EnrolmentDiscount',
        inverseSide: 'enrolment',
      },
      paymentCycles: {
        type: 'one-to-many',
        target: 'PaymentCycle',
        inverseSide: 'enrolment',
      },
    },
  }),
  new EntitySchema<EnrolmentDiscount>({
    target: EnrolmentDiscount,
    name: 'EnrolmentDiscount',
    tableName: 'enrolment_discount',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      enrolmentId: { name: 'enrolmentId', type: Number, unsigned: true },
      discount: { type: 'float', nullable: true },
      discountType: { name: 'discountType', type: Number },
      type: { type: Number },
    },
    relations: {
      enrolment: {
        type: 'many-to-one',
        target: 'Enrolment',
        inverseSide: 'discounts',
        joinColumn: { name: 'enrolmentId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<EnrolmentPaymentFrequency>({
    target: EnrolmentPaymentFrequency,
    name: 'EnrolmentPaymentFrequency',
    tableName: 'enrolment_payment_frequency',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      enrolmentId: { name: 'enrolmentId', type: Number, unsigned: true },
      paymentFrequencyId: { name: 'paymentFrequencyId', type: Number, unsigned: true },
      paymentCycleStartDate: { name: 'paymentCycleStartDate', ...dateColumn },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, unsigned: true },
      updatedByUserId: { name: 'updatedByUserId', type: Number, unsigned: true },
      isDeleted: { name: 'isDeleted', type: Boolean },
    },
  }),
  new EntitySchema<Lesson>({
    target: Lesson,
    name: 'Lesson',
    tableName: 'lesson',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      courseId: { name: 'courseId', type: Number, unsigned: true },
      teacherId: { name: 'teacherId', type: Number, unsigned: true },
      classroomId: { name: 'classroomId', type: Number, nullable: true },
      colorCode: { name: 'colorCode', type: String, length: 7, nullable: true },
      date: { ...dateTimeColumn },
      duration: { type: 'time' },
      status: { type: Number, unsigned: true },
      isPresent: { name: 'isPresent', type: Boolean },
      isDeleted: { name: 'isDeleted', type: Boolean },
      isConfirmed: { name: 'isConfirmed', type: Boolean, nullable: true },
      type: { type: Number, unsigned: true },
      isExploded: { name: 'isExploded', type: Number },
      isOnline: { name: 'is_online', type: Boolean, default: false },
      createdByUserId: { name: 'createdByUserId', type: Number },
      updatedByUserId: { name: 'updatedByUserId', type: Number },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      programRate: { name: 'programRate', ...moneyColumn },
      teacherRate: { name: 'teacherRate', ...moneyColumn },
      teacherRateOld: { name: 'teacherRateOld', ...moneyColumn },
      tax: { ...moneyColumn, default: 0 },
      paidStatus: { name: 'paidStatus', type: Number, default: 0 },
      total: { ...moneyColumn, default: 0 },
      dueDate: { name: 'dueDate', ...dateColumn },
      originalDate: { name: 'originalDate', ...dateTimeColumn, nullable: true },
    },
    relations: {
      course: {
        type: 'many-to-one',
        target: 'Course',
        inverseSide: 'lessons',
        joinColumn: { name: 'courseId' },
        createForeignKeyConstraints: false,
      },
      teacher: {
        type: 'many-to-one',
        target: 'User',
        joinColumn: { name: 'teacherId' },
        createForeignKeyConstraints: false,
      },
      classroom: {
        type: 'many-to-one',
        target: 'Classroom',
        joinColumn: { name: 'classroomId' },
        createForeignKeyConstraints: false,
      },
      privateLesson: {
        type: 'one-to-many',
        target: 'PrivateLesson',
        inverseSide: 'lesson',
      },
      groupLesson: {
        type: 'one-to-many',
        target: 'GroupLesson',
        inverseSide: 'lesson',
      },
      discounts: {
        type: 'one-to-many',
        target: 'LessonDiscount',
        inverseSide: 'lesson',
      },
      invoiceItemLessons: {
        type: 'one-to-many',
        target: 'InvoiceItemLesson',
        inverseSide: 'lesson',
      },
    },
  }),
  new EntitySchema<BulkRescheduleLesson>({
    target: BulkRescheduleLesson,
    name: 'BulkRescheduleLesson',
    tableName: 'bulk_reschedule_lesson',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      lessonId: { name: 'lessonId', type: Number, unsigned: true },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number },
      updatedByUserId: { name: 'updatedByUserId', type: Number },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<GroupLesson>({
    target: GroupLesson,
    name: 'GroupLesson',
    tableName: 'group_lesson',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      lessonId: { name: 'lessonId', type: Number, unsigned: true },
      enrolmentId: { name: 'enrolmentId', type: Number, unsigned: true },
      total: { ...moneyColumn, default: 0 },
      balance: { ...moneyColumn, default: 0 },
      paidStatus: { name: 'paidStatus', type: Number, default: 0 },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
      dueDate: { name: 'dueDate', ...dateColumn, nullable: true },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
      enrolment: {
        type: 'many-to-one',
        target: 'Enrolment',
        joinColumn: { name: 'enrolmentId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<PrivateLesson>({
    target: PrivateLesson,
    name: 'PrivateLesson',
    tableName: 'private_lesson',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      lessonId: { name: 'lessonId', type: Number, unsigned: true },
      expiryDate: { name: 'expiryDate', ...dateTimeColumn },
      total: { ...moneyColumn, default: 0 },
      balance: { ...moneyColumn, default: 0 },
      dueDate: { name: 'dueDate', ...dateColumn },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<PrivateLessonEmailStatus>({
    target: PrivateLessonEmailStatus,
    name: 'PrivateLessonEmailStatus',
    tableName: 'private_lesson_email_status',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      lessonId: { name: 'lessonId', type: Number, unsigned: true },
      notificationType: { name: 'notificationType', type: Number },
      status: { type: Number, default: 0 },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<NotificationEmailType>({
    target: NotificationEmailType,
    name: 'NotificationEmailType',
    tableName: 'notification_email_type',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      emailNotifyType: { type: String, length: 255 },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
      isDeleted: { name: 'isDeleted', type: Number, default: 0 },
    },
  }),
  new EntitySchema<LessonHierarchy>({
    target: LessonHierarchy,
    name: 'LessonHierarchy',
    tableName: 'lesson_hierarchy',
    columns: {
      lessonId: { name: 'lessonId', type: Number, primary: true },
      childLessonId: { name: 'childLessonId', type: Number, primary: true },
      depth: { type: Number },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
      childLesson: {
        type: 'many-to-one',
        target: 'Lesson',
        joinColumn: { name: 'childLessonId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<LessonDiscount>({
    target: LessonDiscount,
    name: 'LessonDiscount',
    tableName: 'lesson_discount',
    columns: {
      id: { type: Number, primary: true, generated: true },
      lessonId: { type: Number, unsigned: true },
      value: { ...moneyColumn, nullable: true },
      enrolmentId: { type: Number, nullable: true },
      valueType: { type: Number },
      type: { type: Number },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        inverseSide: 'discounts',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<LessonPayment>({
    target: LessonPayment,
    name: 'LessonPayment',
    tableName: 'lesson_payment',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      lessonId: { name: 'lessonId', type: Number },
      paymentId: { name: 'paymentId', type: Number },
      enrolmentId: { name: 'enrolmentId', type: Number, nullable: true },
      amount: { ...moneyColumn },
      isDeleted: { name: 'isDeleted', type: Number, default: 0 },
      date: { ...dateTimeColumn, nullable: true },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
      payment: {
        type: 'many-to-one',
        target: 'Payment',
        joinColumn: { name: 'paymentId' },
        createForeignKeyConstraints: false,
      },
      enrolment: {
        type: 'many-to-one',
        target: 'Enrolment',
        joinColumn: { name: 'enrolmentId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<LessonSplitUsage>({
    target: LessonSplitUsage,
    name: 'LessonSplitUsage',
    tableName: 'lesson_split_usage',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      lessonId: { name: 'lessonId', type: Number, unsigned: true },
      extendedLessonId: { name: 'extendedLessonId', type: Number, unsigned: true },
      mergedOn: { name: 'mergedOn', ...dateTimeColumn, nullable: true },
    },
  }),
  new EntitySchema<PaymentCycle>({
    target: PaymentCycle,
    name: 'PaymentCycle',
    tableName: 'payment_cycle',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      enrolmentId: { name: 'enrolmentId', type: Number, unsigned: true },
      startDate: { name: 'startDate', ...dateColumn },
      endDate: { name: 'endDate', ...dateColumn },
      isDeleted: { name: 'isDeleted', type: Number, default: 0 },
      isPreferredPaymentEnabled: { name: 'isPreferredPaymentEnabled', type: Boolean, default: false },
    },
    relations: {
      enrolment: {
        type: 'many-to-one',
        target: 'Enrolment',
        inverseSide: 'paymentCycles',
        joinColumn: { name: 'enrolmentId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<PaymentCycleLesson>({
    target: PaymentCycleLesson,
    name: 'PaymentCycleLesson',
    tableName: 'payment_cycle_lesson',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      paymentCycleId: { name: 'paymentCycleId', type: Number, unsigned: true },
      lessonId: { name: 'lessonId', type: Number, unsigned: true },
      isDeleted: { name: 'isDeleted', type: Number },
    },
  }),
  new EntitySchema<Payment>({
    target: Payment,
    name: 'Payment',
    tableName: 'payment',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      userId: { name: 'user_id', type: Number, unsigned: true },
      paymentMethodId: { name: 'payment_method_id', type: Number, unsigned: true, default: 1 },
      amount: { ...moneyColumn, nullable: true },
      date: { ...dateTimeColumn, nullable: true },
      reference: { type: String, length: 255, nullable: true },
      notes: { type: 'text', nullable: true },
      isDeleted: { type: Number, default: 0 },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
      balance: { ...moneyColumn, default: 0 },
      transactionId: { name: 'transactionId', type: Number, nullable: true },
    },
  }),
  new EntitySchema<CreditUsage>({
    target: CreditUsage,
    name: 'CreditUsage',
    tableName: 'credit_usage',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      creditPaymentId: { name: 'credit_payment_id', type: Number, unsigned: true },
      debitPaymentId: { name: 'debit_payment_id', type: Number, unsigned: true },
    },
  }),
  new EntitySchema<Invoice>({
    target: Invoice,
    name: 'Invoice',
    tableName: 'invoice',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      type: { type: Number, default: 1 },
      isDeleted: { name: 'isDeleted', type: Number, default: 0 },
      isVoid: { name: 'isVoid', type: Number, default: 0 },
    },
    relations: {
      lineItems: {
        type: 'one-to-many',
        target: 'InvoiceLineItem',
        inverseSide: 'invoice',
      },
    },
  }),
  new EntitySchema<InvoiceLineItem>({
    target: InvoiceLineItem,
    name: 'InvoiceLineItem',
    tableName: 'invoice_line_item',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      invoiceId: { name: 'invoice_id', type: Number, unsigned: true },
      itemTypeId: { name: 'item_type_id', type: Number, unsigned: true, default: 0 },
      isDeleted: { name: 'isDeleted', type: Number, default: 0 },
    },
    relations: {
      invoice: {
        type: 'many-to-one',
        target: 'Invoice',
        inverseSide: 'lineItems',
        joinColumn: { name: 'invoice_id' },
        createForeignKeyConstraints: false,
      },
      invoiceItemLesson: {
        type: 'one-to-one',
        target: 'InvoiceItemLesson',
        inverseSide: 'invoiceLineItem',
      },
    },
  }),
  new EntitySchema<InvoiceItemLesson>({
    target: InvoiceItemLesson,
    name: 'InvoiceItemLesson',
    tableName: 'invoice_item_lesson',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      invoiceLineItemId: { name: 'invoiceLineItemId', type: Number, unsigned: true },
      lessonId: { name: 'lessonId', type: Number, unsigned: true },
    },
    relations: {
      lesson: {
        type: 'many-to-one',
        target: 'Lesson',
        inverseSide: 'invoiceItemLessons',
        joinColumn: { name: 'lessonId' },
        createForeignKeyConstraints: false,
      },
      invoiceLineItem: {
        type: 'one-to-one',
        target: 'InvoiceLineItem',
        inverseSide: 'invoiceItemLesson',
        joinColumn: { name: 'invoiceLineItemId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<Qualification>({
    target: Qualification,
    name: 'Qualification',
    tableName: 'qualification',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      teacherId: { name: 'teacher_id', type: Number, unsigned: true },
      programId: { name: 'program_id', type: Number, unsigned: true },
      rate: { type: 'decimal', precision: 10, scale: 2, nullable: true },
      type: { type: Number, unsigned: true },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number },
      updatedByUserId: { name: 'updatedByUserId', type: Number },
    },
    relations: {
      teacher: {
        type: 'many-to-one',
        target: 'User',
        joinColumn: { name: 'teacher_id' },
        createForeignKeyConstraints: false,
      },
      program: {
        type: 'many-to-one',
        target: 'Program',
        joinColumn: { name: 'program_id' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<Holiday>({
    target: Holiday,
    name: 'Holiday',
    tableName: 'holiday',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      date: { ...dateTimeColumn },
      description: { type: String, length: 300, nullable: true },
      isDeleted: { name: 'isDeleted', type: Boolean },
    },
  }),
  new EntitySchema<CustomerDiscount>({
    target: CustomerDiscount,
    name: 'CustomerDiscount',
    tableName: 'customer_discount',
    columns: {
      id: { type: Number, primary: true, generated: true, unsigned: true },
      customerId: { name: 'customerId', type: Number, unsigned: true },
      value: { type: 'float', nullable: true },
      isDeleted: { name: 'isDeleted', type: Boolean, nullable: true },
    },
    relations: {
      customer: {
        type: 'many-to-one',
        target: 'User',
        joinColumn: { name: 'customerId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
  new EntitySchema<EquipmentRental>({
    target: EquipmentRental,
    name: 'EquipmentRental',
    tableName: 'equipment_rentals',
    columns: {
      id: { type: Number, primary: true, generated: true },
      customerId: { name: 'customerId', type: Number },
      studentId: { name: 'studentId', type: Number },
      startDate: { name: 'startDate', ...dateColumn, nullable: true },
      returnDate: { name: 'returnDate', ...dateColumn, nullable: true },
      endDate: { name: 'endDate', ...dateColumn, nullable: true },
      duration: { type: Number, nullable: true },
      isOnGoing: { name: 'isOnGoing', type: Boolean, default: false },
      securityDeposit: { name: 'securityDeposit', type: Boolean, default: false },
      tenderType: { name: 'tenderType', type: Number, nullable: true },
      depositAmount: { name: 'depositAmount', ...moneyColumn, nullable: true },
      hst: { type: 'decimal', precision: 10, scale: 4, default: 0 },
      total: { type: 'decimal', precision: 10, scale: 4, nullable: true },
      isDeleted: { name: 'isDeleted', type: Boolean, default: false },
      isReturned: { name: 'isReturned', type: Boolean, default: false },
      createdOn: { name: 'createdOn', ...dateTimeColumn, nullable: true },
      updatedOn: { name: 'updatedOn', ...dateTimeColumn, nullable: true },
      createdByUserId: { name: 'createdByUserId', type: Number, default: 0 },
      updatedByUserId: { name: 'updatedByUserId', type: Number, default: 0 },
    },
    relations: {
      student: {
        type: 'many-to-one',
        target: 'Student',
        joinColumn: { name: 'studentId' },
        createForeignKeyConstraints: false,
      },
    },
  }),
];
