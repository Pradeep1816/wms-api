import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CustomerRecurringPayment } from './customer-recurring-payment.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';

@Entity('customer_recurring_payment_enrolment')
export class CustomerRecurringPaymentEnrolment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    customerRecurringPaymentId: number;

    @Column()
    enrolmentId: number;

    @Column({ default: false })
    isDeleted: boolean;

    @CreateDateColumn({ type: 'timestamp', name: 'createdOn' })
    createdOn: Date;

    @UpdateDateColumn({ type: 'timestamp', name: 'updatedOn' })
    updatedOn: Date;

    @Column()
    createdByUserId: number;

    @Column()
    updatedByUserId: number;

    @ManyToOne(() => CustomerRecurringPayment, crp => crp.enrolments)
    customerRecurringPayment: CustomerRecurringPayment;

    @ManyToOne(() => Enrolment, enrolment => enrolment.customerRecurringPaymentEnrolments)
    //@JoinColumn({ name: 'enrolmentId' })
    enrolment: Enrolment;
    }
