import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('label')
export class Label {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'userAdded' })
  userAdded: number;
}
