import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToOne, OneToMany } from 'typeorm';
import { Item } from './item.entity';


@Entity('item_category')
export class ItemCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /**
   * Legacy global royalty percentage retained for backwards compatibility and
   * migration seeding. New sales use the location-specific category rate.
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  royality: number;

  @Column()
  isDeleted: boolean;

  @OneToOne(() => Item, item => item.itemCategoryId)
  item: Item;

  // Protected categories that cannot be modified from Backend
  static readonly CATEGORY_LESSON = 1;
  static readonly CATEGORY_OPENING_BALANCE = 4;

  static usesLocationRoyalty(id: number): boolean {
    return id === this.CATEGORY_LESSON;
  }

  static canUpdate(id: number): boolean {
    return ![this.CATEGORY_LESSON, this.CATEGORY_OPENING_BALANCE].includes(id);
  }
}
