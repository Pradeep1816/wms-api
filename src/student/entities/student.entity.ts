import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToMany, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { EquipmentRental } from '../../equipment-rental/entities/equipment-rental.entity';
import { User } from '../../user/entities/user.entity';

@Entity('student')
export class Student {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ 
    name: 'first_name', 
    type: 'varchar', 
    length: 30
  })
  firstName: string;

  @Column({ 
    name: 'last_name', 
    type: 'varchar', 
    length: 30
  })
  lastName: string;

  @Column({ 
    name: 'birth_date', 
    type: 'date', 
    nullable: true 
  })
  birthDate: Date;

  @Column({ 
    name: 'customer_id', 
    type: 'int', 
    nullable: true 
  })
  @Index()
  customerId: number;

  @Column({ 
    type: 'tinyint', 
    unsigned: true,
    comment: '1 - Active, 2 - Inactive'
  })
  status: number;

  @Column({
    type: 'boolean',
    nullable: true,
  })
  mediaAndOnlineLessonConsent: boolean;

  @Column({
    name: 'isDeleted', 
    type: 'tinyint', 
    unsigned: true 
  })
  isDeleted: number;

  @Column({ 
    type: 'varchar', 
    length: 255
  })
  gender: string;

  @Column({ 
    type: 'varchar', 
    length: 255,
    nullable: true 
  })
  note: string;

  @CreateDateColumn({ 
    name: 'createdOn', 
    type: 'timestamp', 
    nullable: true 
  })
  createdOn: Date;

  @UpdateDateColumn({ 
    name: 'updatedOn', 
    type: 'timestamp', 
    nullable: true 
  })
  updatedOn: Date;

  @Column({ 
    name: 'createdByUserId', 
    type: 'int', 
    unsigned: true 
  })
  createdByUserId: number;

  @Column({ 
    name: 'updatedByUserId', 
    type: 'int', 
    unsigned: true 
  })
  updatedByUserId: number;

  // Relations
  @OneToMany(() => Enrolment, enrolment => enrolment.student)
  enrolments: Enrolment[];

  @ManyToOne(() => CustomerAccount, customerAccount => customerAccount.customer)
  @JoinColumn({ name: 'customer_id' })
  customerAccount: CustomerAccount;

  @OneToMany(() => EquipmentRental, equipmentRental => equipmentRental.student)
  equipmentRentals: EquipmentRental[];

  @OneToOne(() => User)
  @JoinColumn({ name: 'customer_id' })
  user: User;
}
