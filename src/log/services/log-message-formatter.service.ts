import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from 'src/invoice/entities/invoice.entity';
import { LogLink } from '../entities/log-link.entity';
import { transformPath as transformLegacyPath } from '../../utils/url-transformer.utils';

@Injectable()
export class LogMessageFormatterService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async formatMessage(message: string, logLinks: LogLink[] = [], locationSlug?: string): Promise<string> {
    if (!message) {
      return 'No log message available';
    }

    const regex = /\{\{([^}]*)\}\}/g;
    const matches = [...message.matchAll(regex)];
    if (matches.length === 0) {
      return message;
    }

    let result = message;
    const isLessonMessage = /\bsmw bot\b/i.test(message) && /\blesson\b/i.test(message);
    let isLessonTextLinked = false;

    for (const match of matches) {
      const index = match[1];
      const link = logLinks.find(logLink => logLink.index === index);

      if (link) {
        const transformedPath = await this.transformPath(link.path, locationSlug);
        const url = `${link.baseUrl}${transformedPath}`;

        if (isLessonMessage && !isLessonTextLinked) {
          result = result.replace(match[0], index);
          result = result.replace(/\blesson\b/i, lessonWord => `<a href="${url}">${lessonWord}</a>`);
          isLessonTextLinked = true;
        } else {
          result = result.replace(match[0], `<a href="${url}">${index}</a>`);
        }
      } else {
        result = result.replace(match[0], index);
      }
    }

    return result;
  }

  private async transformPath(path: string, locationSlug?: string): Promise<string> {
    const invoiceMatch = path.match(/\/admin(?:\/([^\/]+))?\/invoice\/view\?id=(\d+)/);
    if (invoiceMatch) {
      const location = invoiceMatch[1] || locationSlug;
      const entityId = parseInt(invoiceMatch[2], 10);

      // In this log flow, id in legacy invoice path can be a lesson id.
      // Prefer invoice lookup and fallback to lesson route.
      const invoice = await this.invoiceRepository.findOne({
        where: {
          id: entityId,
          isDeleted: false,
        },
      });

      if (invoice) {
        return `/v2/admin/${location}/invoices/${invoice.id}`;
      }

      return `/v2/admin/${location}/private-lessons/${entityId}`;
    }

    return transformLegacyPath(path, locationSlug);
  }
}
