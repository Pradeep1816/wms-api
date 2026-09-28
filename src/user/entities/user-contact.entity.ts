import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { UserEmail } from './user-email.entity';
import { UserPhone } from './user-phone.entity';
import { User } from './user.entity';
import { UserAddress } from './user-address.entity';
import { Label } from './label.entity';

@Entity('user_contact')
export class UserContact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId' })
  userId: number;

  @Column({ name: 'isPrimary', type: 'tinyint', width: 1 })
  isPrimary: boolean;

  @Column({ name: 'labelId' })
  labelId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  @OneToMany(() => UserEmail, email => email.userContact)
  emails: UserEmail[];

  @OneToMany(() => UserPhone, phone => phone.contact)
  phones: UserPhone[];

  @ManyToOne(() => User, user => user.contacts)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => UserAddress, address => address.userContact)
  addresses: UserAddress[];

  @ManyToOne(() => Label)
  @JoinColumn({ name: 'labelId' })
  label?: Label;

  static LABEL_WORK = 2;
  static LABEL_HOME = 1;
  static LABEL_OTHER = 3;

  /**
   * Get label name from label ID
   * Based on legacy label constants
   */
  static getLabelName(labelId?: number | null, labelName?: string | null): string {
    if (labelName?.trim()) {
      return labelName;
    }

    switch (labelId) {
      case UserContact.LABEL_HOME: return 'Home';
      case UserContact.LABEL_WORK: return 'Work';
      case UserContact.LABEL_OTHER: return 'Other';
      default: return 'Other';
    }
  }
}
