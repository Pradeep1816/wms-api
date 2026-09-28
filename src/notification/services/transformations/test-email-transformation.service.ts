import { Injectable } from '@nestjs/common';
import { TestEmailResponseDto } from 'src/notification/dto/test-email-response.dto';
import { TestEmail } from 'src/notification/entities/test-email.entity';


@Injectable()
export class TestEmailTransformationService {

  transformRow(item: TestEmail): TestEmailResponseDto {
    return {
      id: item.id,
      email: item.email,
    };
  }

  transformRows(items: TestEmail[]): TestEmailResponseDto[] {
    return items.map((item) => this.transformRow(item));
  }
}
