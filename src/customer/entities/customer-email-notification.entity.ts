import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { NotificationEmailType } from "./notification-email-type.entity";

@Entity('customer_email_notification')
export class CustomerEmailNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  emailNotificationTypeId: number;

  @Column({ type: 'tinyint', width: 1 })
  isChecked: number;

  @ManyToOne(() => NotificationEmailType)
  @JoinColumn({ name: 'emailNotificationTypeId' })
  notificationType: NotificationEmailType;
}
