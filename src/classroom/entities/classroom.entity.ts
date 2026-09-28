import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('classroom')
export class Classroom {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ 
    type: 'varchar', 
    length: 250,
    nullable: true
  })
  name: string;

  @Column({ 
    type: 'text'
  })
  description: string;

  @Column({ 
    name: 'locationId', 
    type: 'tinyint', 
    unsigned: true 
  })
  @Index()
  locationId: number;

  @CreateDateColumn({ 
    name: 'createdOn', 
    type: 'timestamp', 
    nullable: true 
  })
  createdOn: Date;

  @UpdateDateColumn({ 
    name: 'updatedOn', 
    type: 'timestamp', 
    nullable: true 
  })
  updatedOn: Date;

  @Column({ 
    name: 'createdByUserId', 
    type: 'int', 
    unsigned: true 
  })
  createdByUserId: number;

  @Column({ 
    name: 'updatedByUserId', 
    type: 'int', 
    unsigned: true 
  })
  updatedByUserId: number;

  @Column({ 
    name: 'isDeleted', 
    type: 'tinyint', 
    width: 1 
  })
  isDeleted: boolean;
}
