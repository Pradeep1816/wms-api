import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_token')
export class UserToken {
  static readonly TYPE_PASSWORD_RESET = 'password_reset';

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 255 })
  type: string;

  @Column({ type: 'varchar', length: 40 })
  token: string;

  @Column({ name: 'expire_at', type: 'int', nullable: true })
  expireAt: number | null;

  @Column({ name: 'created_at', type: 'int', nullable: true })
  createdAt: number | null;

  @Column({ name: 'updated_at', type: 'int', nullable: true })
  updatedAt: number | null;
}
