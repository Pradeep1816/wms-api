import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { UserContact } from './user-contact.entity';
import { User } from './user.entity';

@Entity('user_email')
export class UserEmail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userContactId', nullable: true })
  userContactId: number;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  @ManyToOne(() => UserContact, { nullable: true })
  @JoinColumn({ name: 'userContactId' })
  userContact: UserContact;
}
