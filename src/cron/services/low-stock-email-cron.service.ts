import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isEmail } from 'class-validator';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { LowStockAlert } from '../../item/entities/low-stock-alert.entity';
import { ItemLocationStock } from '../../item/entities/item-location-stock.entity';
import { Item } from '../../item/entities/item.entity';
import { Location } from '../../location/entities/location.entity';
import { isLowStock } from '../../item/services/low-stock-alert.util';
import { isPOSFeatureEnabled } from '../../shared/helpers/pos-rollout.helper';
import { MailerService } from '../../shared/services/mailer.service';
import { CronLockService } from './cron-lock.service';

// Includes the initial attempt: four automatic retries, not five retries.
const MAX_DELIVERY_ATTEMPTS = 5;

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

@Injectable()
export class LowStockEmailCronService {
  private readonly logger = new Logger(LowStockEmailCronService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailer: MailerService,
    private readonly locks: CronLockService,
  ) {}

  @Cron('0 * * * * *', {
    name: 'low-stock-email',
    timeZone: 'America/New_York',
  })
  async runScheduled() {
    // Use the same connection-held MySQL GET_LOCK as the existing email cron.
    // Every API instance and the manual endpoint must use this identical key.
    return this.locks.runWithLock(
      'cron:low-stock-email',
      'low-stock-email',
      this.logger,
      () => this.deliverPending(),
    );
  }

  getJobMetadata() {
    return {
      name: 'low-stock-email',
      enabled: true,
      expression: '0 * * * * *',
      timeZone: 'America/New_York',
      manualTriggerAllowed: true,
      maxDeliveryAttempts: MAX_DELIVERY_ATTEMPTS,
      allowedRoles: ['administrator'],
    };
  }

  async getRecentAlerts() {
    return this.dataSource
      .getRepository(LowStockAlert)
      .find({ order: { id: 'DESC' }, take: 100 });
  }

  private async deliverPending() {
    const repository = this.dataSource.getRepository(LowStockAlert);
    // The advisory lock prevents another worker from sending concurrently. If a
    // previous process died after SMTP acceptance, do not resend blindly: SMTP
    // has no atomic commit with MySQL. Expose this state for operator review.
    await repository.update(
      { status: 'sending' },
      {
        status: 'review',
        lastError:
          'Delivery interrupted; verify SMTP delivery before any manual retry.',
      },
    );
    const alerts = await repository.find({
      where: { status: 'pending', nextAttemptAt: LessThanOrEqual(Date.now()) },
      order: { id: 'ASC' },
      take: 50,
    });
    for (const alert of alerts) await this.deliver(alert);
    return { processed: alerts.length };
  }

  private async deliver(alert: LowStockAlert) {
    const repository = this.dataSource.getRepository(LowStockAlert);
    // Also stop older pending rows that exceeded the cap before this version.
    if (Number(alert.attempts) >= MAX_DELIVERY_ATTEMPTS) {
      await this.markFailed(
        alert,
        Number(alert.attempts),
        alert.lastError || 'Delivery was not completed.',
      );
      return;
    }
    const [location, item, stock] = await Promise.all([
      this.dataSource
        .getRepository(Location)
        .findOneBy({ id: alert.locationId }),
      this.dataSource.getRepository(Item).findOneBy({ id: alert.itemId }),
      this.dataSource
        .getRepository(ItemLocationStock)
        .findOneBy({ itemId: alert.itemId, locationId: alert.locationId }),
    ]);
    if (
      !location ||
      location.isDeleted ||
      !isPOSFeatureEnabled(location.slug) ||
      !item ||
      item.isDeleted ||
      !isLowStock(stock)
    ) {
      await repository.update(alert.id, {
        status: 'suppressed',
        lastError:
          'Item is no longer low, unavailable, or outside the POS rollout.',
      });
      return;
    }
    const recipient = location.email?.trim();
    if (!recipient || !isEmail(recipient)) {
      await this.retryLater(
        alert,
        "Configure a valid email address in this location's settings.",
      );
      return;
    }
    await repository.update(alert.id, {
      status: 'sending',
      recipient,
      attempts: alert.attempts + 1,
      lastError: null,
    });
    try {
      await this.mailer.sendEmail({
        from: recipient,
        replyTo: recipient,
        to: [recipient],
        messageId: `<smw-low-stock-${alert.id}-${alert.createdAt}@notifications.studiomanagerweb.com>`,
        subject: `Low stock: ${String(item.code).replace(/[\r\n]/g, ' ')} - ${String(location.name).replace(/[\r\n]/g, ' ')}`,
        html: `<p>Stock is below the configured low-stock quantity at <strong>${escapeHtml(location.name)}</strong>.</p>
          <table><tr><th>Item</th><td>${escapeHtml(item.description)}</td></tr>
          <tr><th>Code</th><td>${escapeHtml(item.code)}</td></tr>
          <tr><th>UPC</th><td>${escapeHtml(item.upcCode || 'Not set')}</td></tr>
          <tr><th>Stock when warning started</th><td>${alert.stockQuantity}</td></tr>
          <tr><th>Current stock</th><td>${stock!.stockQuantity}</td></tr>
          <tr><th>Low-stock quantity</th><td>${stock!.lowStockQuantity}</td></tr></table>
          <p>Please review this item on the Items page for ${escapeHtml(location.name)}.</p>`,
      });
    } catch (error) {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      const smtp = cause as {
        code?: string;
        responseCode?: number;
        command?: string;
      };
      // Retry explicit rejection or connection/auth failure before message
      // acceptance. Ambiguous DATA timeouts need review to avoid duplicates.
      if (
        Number(smtp?.responseCode) >= 400 ||
        ['ECONNECTION', 'EDNS', 'EAUTH', 'EENVELOPE', 'ETLS'].includes(
          smtp?.code ?? '',
        ) ||
        (smtp?.code === 'ETIMEDOUT' &&
          ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH'].includes(
            smtp?.command ?? '',
          ))
      ) {
        await this.retryLater(
          alert,
          'Email delivery rejected or connection unavailable; check SMTP configuration.',
        );
      } else {
        await repository.update(alert.id, {
          status: 'review',
          lastError:
            'SMTP outcome uncertain; verify delivery before any manual retry.',
        });
        this.logger.error(
          `Low-stock alert ${alert.id} requires delivery review (location ${alert.locationId}).`,
        );
      }
      return;
    }
    // Keep this outside the SMTP catch. A DB failure after acceptance must not
    // turn a delivered message into a retryable event.
    await repository.update(alert.id, {
      status: 'sent',
      sentAt: Date.now(),
      lastError: null,
    });
  }

  private async retryLater(alert: LowStockAlert, reason: string) {
    const attempts = Number(alert.attempts) + 1;
    if (attempts >= MAX_DELIVERY_ATTEMPTS) {
      await this.markFailed(alert, attempts, reason);
      return;
    }
    const delay = 2 ** (attempts - 1) * 60_000;
    await this.dataSource.getRepository(LowStockAlert).update(alert.id, {
      status: 'pending',
      attempts,
      nextAttemptAt: Date.now() + delay,
      lastError: reason,
    });
    this.logger.warn(
      `Low-stock alert ${alert.id}, location ${alert.locationId}: ${reason}`,
    );
  }

  private async markFailed(
    alert: LowStockAlert,
    attempts: number,
    reason: string,
  ) {
    const lastError = `Stopped after ${attempts} attempts. ${reason}`.slice(
      0,
      500,
    );
    await this.dataSource.getRepository(LowStockAlert).update(alert.id, {
      status: 'failed',
      attempts,
      lastError,
    });
    this.logger.error(
      `Low-stock alert ${alert.id}, location ${alert.locationId}: ${lastError}`,
    );
  }
}
