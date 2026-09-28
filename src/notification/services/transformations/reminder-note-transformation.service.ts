import { Injectable } from '@nestjs/common';
import { ReminderNoteResponseDto } from 'src/notification/dto/reminder-response.dto';
import { ReminderNote } from 'src/notification/entities/reminder-note.entity';


@Injectable()
export class ReminderNoteTransformationService {
  
  transformRow(item: ReminderNote): ReminderNoteResponseDto {
    return {
      id: item.id,
      notes: item.notes,
    };
  }

  transformRows(items: ReminderNote[]): ReminderNoteResponseDto[] {
    return items.map(item => this.transformRow(item));
  }
}
