import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LowStockEmailCronService } from './low-stock-email-cron.service';
import { LowStockAlert } from '../../item/entities/low-stock-alert.entity';
import { Location } from '../../location/entities/location.entity';
import { Item } from '../../item/entities/item.entity';
import { ItemLocationStock } from '../../item/entities/item-location-stock.entity';

function fixture() {
  const alert = {
    id: 1,
    itemId: 10,
    locationId: 15,
    stockQuantity: 8,
    lowStockQuantity: 9,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
  } as LowStockAlert;
  const location = {
    id: 15,
    slug: 'training-location',
    name: 'Training <School>',
    email: 'training@example.com',
    isDeleted: false,
  };
  const item = {
    description: 'Book <script>',
    code: 'BOOK',
    upcCode: '005',
    isDeleted: false,
  };
  const stock = { trackInventory: true, stockQuantity: 7, lowStockQuantity: 9 };
  const repository = {
    find: vi.fn(async () =>
      alert.status === 'pending' && alert.nextAttemptAt <= Date.now()
        ? [{ ...alert }]
        : [],
    ),
    update: vi.fn(async (criteria: any, data: any) => {
      if (criteria === alert.id || criteria.status === alert.status)
        Object.assign(alert, data);
    }),
  };
  const repositories = new Map<any, any>([
    [LowStockAlert, repository],
    [Location, { findOneBy: vi.fn(async () => location) }],
    [Item, { findOneBy: vi.fn(async () => item) }],
    [ItemLocationStock, { findOneBy: vi.fn(async () => stock) }],
  ]);
  const mailer = { sendEmail: vi.fn(async () => {}) };
  const locks = { runWithLock: vi.fn(async (_a, _b, _c, run) => run()) };
  const service = new LowStockEmailCronService(
    { getRepository: (entity) => repositories.get(entity) } as any,
    mailer as any,
    locks as any,
  );
  return { service, alert, location, item, stock, mailer, repository, locks };
}

afterEach(() => vi.unstubAllEnvs());

describe('low-stock email delivery', () => {
  it.each(['SMTP rejection', 'missing address'])(
    'stops after five attempts for %s',
    async (reason) => {
      const f = fixture();
      if (reason === 'missing address') f.location.email = '';
      else
        f.mailer.sendEmail.mockRejectedValue(
          Object.assign(new Error('offline'), { code: 'ECONNECTION' }),
        );
      for (let attempt = 1; attempt <= 5; attempt++) {
        f.alert.nextAttemptAt = 0;
        const before = Date.now();
        await f.service.runScheduled();
        expect(f.alert.attempts).toBe(attempt);
        expect(f.alert.status).toBe(attempt === 5 ? 'failed' : 'pending');
        if (attempt < 5) {
          const delay = 2 ** (attempt - 1) * 60_000;
          expect(f.alert.nextAttemptAt).toBeGreaterThanOrEqual(before + delay);
          expect(f.alert.nextAttemptAt).toBeLessThanOrEqual(Date.now() + delay);
        }
      }
      expect(f.alert.lastError).toContain('5 attempts');
      await f.service.runScheduled();
      expect(f.mailer.sendEmail).toHaveBeenCalledTimes(
        reason === 'missing address' ? 0 : 5,
      );
      expect(f.alert.attempts).toBe(5);
    },
  );

  it('does not send an older pending alert that has already reached the cap', async () => {
    const f = fixture();
    f.alert.attempts = 8;
    await f.service.runScheduled();
    expect(f.alert.status).toBe('failed');
    expect(f.alert.attempts).toBe(8);
    expect(f.mailer.sendEmail).not.toHaveBeenCalled();
  });

  it('allows the fifth and final attempt to succeed', async () => {
    const f = fixture();
    f.alert.attempts = 4;
    await f.service.runScheduled();
    expect(f.alert).toMatchObject({ status: 'sent', attempts: 5 });
    await f.service.runScheduled();
    expect(f.mailer.sendEmail).toHaveBeenCalledOnce();
  });

  it('sends only to the affected school, escapes content and does not resend a completed alert', async () => {
    const f = fixture();
    await f.service.runScheduled();
    await f.service.runScheduled();
    expect(f.mailer.sendEmail).toHaveBeenCalledOnce();
    expect(f.mailer.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['training@example.com'],
        html: expect.stringContaining('Book &lt;script&gt;'),
        messageId: expect.stringContaining('smw-low-stock-1-'),
      }),
    );
    expect(f.alert.status).toBe('sent');
    expect(f.locks.runWithLock.mock.calls[0][0]).toBe('cron:low-stock-email');
  });

  it('retries missing school email after correction without using a different school address', async () => {
    const f = fixture();
    f.location.email = '';
    await f.service.runScheduled();
    expect(f.mailer.sendEmail).not.toHaveBeenCalled();
    expect(f.alert).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: expect.stringContaining('location'),
    });
    expect(f.alert.nextAttemptAt).toBeGreaterThan(Date.now());
    f.location.email = 'corrected@example.com';
    f.alert.nextAttemptAt = 0;
    await f.service.runScheduled();
    expect(f.mailer.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['corrected@example.com'] }),
    );
  });

  it('backs off a definite SMTP failure and retries once on success', async () => {
    const f = fixture();
    f.mailer.sendEmail.mockRejectedValueOnce(
      Object.assign(new Error('offline'), { code: 'ECONNECTION' }),
    );
    await f.service.runScheduled();
    expect(f.alert).toMatchObject({ status: 'pending', attempts: 1 });
    await f.service.runScheduled();
    expect(f.mailer.sendEmail).toHaveBeenCalledOnce();
    f.alert.nextAttemptAt = 0;
    await f.service.runScheduled();
    expect(f.alert).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('does not automatically resend an ambiguous SMTP outcome', async () => {
    const f = fixture();
    f.mailer.sendEmail.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), {
        code: 'ETIMEDOUT',
        command: 'DATA',
      }),
    );
    await f.service.runScheduled();
    await f.service.runScheduled();
    expect(f.alert.status).toBe('review');
    expect(f.mailer.sendEmail).toHaveBeenCalledOnce();
  });

  it('does not retry if SMTP succeeded but marking delivery failed', async () => {
    const f = fixture();
    const update = f.repository.update.getMockImplementation()!;
    f.repository.update.mockImplementation(async (criteria, data) => {
      if (data.status === 'sent') throw new Error('DB unavailable');
      return update(criteria, data);
    });
    await expect(f.service.runScheduled()).rejects.toThrow('DB unavailable');
    expect(f.alert.status).toBe('sending');
    await f.service.runScheduled();
    expect(f.alert.status).toBe('review');
    expect(f.mailer.sendEmail).toHaveBeenCalledOnce();
  });

  it.each(['restocked', 'disabled', 'deleted', 'outside rollout'])(
    'suppresses a queued alert when %s',
    async (reason) => {
      const f = fixture();
      if (reason === 'restocked') f.stock.stockQuantity = 9;
      if (reason === 'disabled') f.stock.trackInventory = false;
      if (reason === 'deleted') f.item.isDeleted = true;
      if (reason === 'outside rollout') {
        vi.stubEnv('NODE_ENV', 'production');
        f.location.slug = 'bolton';
      }
      await f.service.runScheduled();
      expect(f.alert.status).toBe('suppressed');
      expect(f.mailer.sendEmail).not.toHaveBeenCalled();
    },
  );

  it.each(['training-location', 'burlington'])(
    'allows the production pilot at %s',
    async (slug) => {
      vi.stubEnv('NODE_ENV', 'production');
      const f = fixture();
      f.location.slug = slug;
      await f.service.runScheduled();
      expect(f.alert.status).toBe('sent');
    },
  );
});
