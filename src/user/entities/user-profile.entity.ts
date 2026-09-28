import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_profile')
export class UserProfile {
  @PrimaryColumn({ name: 'user_id' })
  userId: number;

  @Column({ name: 'firstname', nullable: true })
  firstname: string;

  @Column({ name: 'middlename', nullable: true })
  middlename: string;

  @Column({ name: 'lastname', nullable: true })
  lastname: string;

  @Column({ name: 'avatar_path', nullable: true })
  avatarPath: string;

  @Column({ name: 'avatar_base_url', nullable: true })
  avatarBaseUrl: string;

  @Column({ name: 'locale', nullable: true })
  locale: string;

  @Column({ name: 'gender', type: 'smallint', nullable: true })
  gender: number;

  @Column({ name: 'birthDate', type: 'date', nullable: true })
  birthDate: Date;

  @Column({
    name: 'businessName',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  businessName: string | null;

@Column({
  name: 'signatureDataUrl',
  type: 'longtext',
  nullable: true,
})
signatureDataUrl: string | null;

  @OneToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
