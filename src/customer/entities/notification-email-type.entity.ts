import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { CustomerEmailNotification } from "./customer-email-notification.entity";

@Entity('notification_email_type')
export class NotificationEmailType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  emailNotifyType: string;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: number;

  @OneToMany(() => CustomerEmailNotification, notif => notif.notificationType)
  customerNotifications: CustomerEmailNotification[];
}
