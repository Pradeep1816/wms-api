import { Lesson } from '../../entities/lesson.entity';
import { EmailTemplate } from '../../../notification/entities/email-template.entity';
import { LessonEmailStatementTransformationService } from './lesson-email-statement-transformation.service';

describe('LessonEmailStatementTransformationService', () => {
  const service = new LessonEmailStatementTransformationService();

  it('includes every customer email in the lesson email recipient field', () => {
    const lesson = {
      status: 5,
      course: {
        program: { name: 'Piano' },
        enrolments: [],
      },
      privateLesson: [],
      getStatus: () => 'Unscheduled',
    } as unknown as Lesson;
    const template = {
      id: 2,
      subject: 'Lesson reminder',
      header: 'Header',
      footer: 'Footer',
    } as EmailTemplate;

    const result = service.transformEmailStatementData(
      lesson,
      ['primary@example.com', 'secondary@example.com'],
      template,
    );

    expect(result.emailTemplate.to).toBe(
      'primary@example.com, secondary@example.com',
    );
  });
});
