import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('release_notes_read')
export class ReleaseNotesRead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'release_note_id' })
  releaseNoteId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'is_read', type: 'int', default: 0 })
  isRead: number;
 

  @Column({ name: 'isDeleted', type: 'boolean', default: false })
  isDeleted: boolean;
}
