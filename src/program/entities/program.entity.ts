import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Course } from '../../course/entities/course.entity';

@Entity('program')
export class Program {
  // Status constants
  static readonly STATUS_INACTIVE = 0;
  static readonly STATUS_ACTIVE = 1;

  // Type constants
  static readonly TYPE_PRIVATE_PROGRAM = 1;
  static readonly TYPE_GROUP_PROGRAM = 2;
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  /**
   * Internal name. Staff-facing only.
   *
   * May carry a marker that must never reach a customer or instructor: the `x`
   * prefix on the previous pricing structure, or the underscore prefix on an
   * interim September 2026 program. Outward-facing output must use
   * `publicName`.
   */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /**
   * The name safe to show a customer or an instructor.
   *
   * Backfilled from `name` with any leading marker removed, so `xVocal Core`
   * and `_Flute` display as `Vocal Core` and `Flute`.
   *
   * Nullable for compatibility with rows created before this column existed;
   * read it through `ProgramPresentationService`, never directly, so the
   * fallback stays in one place.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  publicName: string | null;

  /**
   * `standard` or `vocal` - which half of the September 2026 matrix applies.
   *
   * Deliberately a property of the program rather than something derived from
   * the rate at read time. Rate is not a safe signal: `Harmonium` sits at the
   * same $72.50/hr as the vocal programs and is an instrument.
   *
   * NULL means unclassified, which must be resolved during migration rather
   * than defaulted.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  pricingCategory: string | null;

  /**
   * Where a retired `x` program or an interim prefixed program points once it
   * is merged into the program that replaces it. NULL for canonical programs.
   */
  @Column({
    name: 'canonicalProgramId',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  canonicalProgramId: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  rate: number;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '1 - active; 2 - inactive',
  })
  status: number;

  @Column({ type: 'tinyint', unsigned: true })
  type: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true })
  updatedByUserId: number;

  // Relations
  @OneToMany(() => Course, (course) => course.program)
  courses: Course[];
}
