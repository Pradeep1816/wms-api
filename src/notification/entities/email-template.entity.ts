import {Entity,PrimaryGeneratedColumn,Column,ManyToOne,JoinColumn,} from 'typeorm';
import { EmailObject } from './email-object.entity';

@Entity({ name: 'email_template' })
export class EmailTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  emailTypeId: number;

  @Column()
  subject: string;

  @Column({ type: 'text', nullable: true })
  header: string;

  @Column({ type: 'text', nullable: true })
  footer: string;

  @Column({ name: 'createdAt', type: 'datetime', nullable: true })
  createdAt: Date;

  @Column({ name: 'updatedAt', type: 'datetime', nullable: true })
  updatedAt: Date;

  
  @ManyToOne(() => EmailObject)
  @JoinColumn({ name: 'emailTypeId', referencedColumnName: 'id' })
  emailObject: EmailObject;
}
