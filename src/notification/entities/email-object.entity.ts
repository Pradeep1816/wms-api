import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'email_object' })
export class EmailObject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;


}
