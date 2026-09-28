import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

type EmailQueueJobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface QueueEntry {
  id: string;
  name: string;
  run: () => Promise<void>;
}

export interface EmailQueueJob {
  id: string;
  name: string;
  status: EmailQueueJobStatus;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

@Injectable()
export class EmailQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private readonly queue: QueueEntry[] = [];
  private readonly jobs = new Map<string, EmailQueueJob>();
  private readonly workerConcurrency: number;
  private activeWorkers = 0;
  private isDrainingScheduled = false;
  private isShuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    this.workerConcurrency = Math.max(
      1,
      this.configService.get<number>('smtp.asyncQueueConcurrency') ?? 1,
    );
  }

  enqueue(name: string, run: () => Promise<void>): EmailQueueJob {
    if (this.isShuttingDown) {
      throw new Error('Email queue is shutting down');
    }

    const job: EmailQueueJob = {
      id: randomUUID(),
      name,
      status: 'queued',
      queuedAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);
    this.queue.push({
      id: job.id,
      name,
      run,
    });

    this.logger.log(`Queued email job ${job.id} (${name})`);
    this.scheduleDrain();

    return job;
  }

  getJob(jobId: string): EmailQueueJob | undefined {
    return this.jobs.get(jobId);
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    if (this.queue.length > 0 || this.activeWorkers > 0) {
      this.logger.warn(
        `Email queue shutting down with ${this.queue.length} queued and ${this.activeWorkers} active job(s)`,
      );
    }
  }

  private scheduleDrain(): void {
    if (this.isDrainingScheduled) {
      return;
    }

    this.isDrainingScheduled = true;
    setImmediate(() => {
      this.isDrainingScheduled = false;
      void this.drainQueue();
    });
  }

  private async drainQueue(): Promise<void> {
    while (!this.isShuttingDown && this.activeWorkers < this.workerConcurrency && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry) {
        return;
      }

      this.activeWorkers += 1;
      void this.runJob(entry);
    }
  }

  private async runJob(entry: QueueEntry): Promise<void> {
    const job = this.jobs.get(entry.id);
    if (!job) {
      this.activeWorkers -= 1;
      this.scheduleDrain();
      return;
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();

    try {
      await entry.run();
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      this.logger.log(`Completed email job ${job.id} (${entry.name})`);
    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : 'Unknown email queue error';
      this.logger.error(`Email job ${job.id} (${entry.name}) failed: ${job.error}`);
    } finally {
      this.activeWorkers -= 1;
      this.scheduleDrain();
    }
  }
}
