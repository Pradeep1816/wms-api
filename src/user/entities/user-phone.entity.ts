import { Entity, Column, PrimaryGeneratedColumn, JoinColumn, ManyToOne } from 'typeorm';
import { UserContact } from './user-contact.entity'; // Adjust the import path as necessary

@Entity('user_phone')
export class UserPhone {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userContactId: number;

  @Column({ type: 'varchar', length: 20 })
  number: string;

  @Column({ name: 'extension' })
  extension: number;

  @Column({ name:'note', type: 'varchar', length: 20 })
  note: string;

  @Column({ name:'isDeleted', type: 'tinyint',default: false })
  isDeleted: boolean;

  @ManyToOne(() => UserContact, (contact) => contact.phones)
  @JoinColumn({ name: 'userContactId' })
  contact: UserContact;

}
