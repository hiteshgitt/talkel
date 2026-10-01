import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@speakai/db';
import { type AnalysisService, RetryableAnalysisError } from './analysis.service.js';
import { EvaluationProviderError } from './gemini-text.js';

/** Same retry budget as the Redis queue: 6 attempts, 20 s … 5 min apart. */
export const MAX_ATTEMPTS = 6;
export const backoffMs = (attempt: number) => Math.min(5 * 60_000, 20_000 * 2 ** Math.max(0, attempt - 1));
/** A claimed job not finished by then (e.g. the process stopped) is picked up again. */
const LOCK_MINUTES = 10;

/**
 * Consumes the database-backed analysis queue (see DbAnalysisQueue). One job at a time; claims use
 * FOR UPDATE SKIP LOCKED, so several processes could share the queue safely.
 */
export class DbAnalysisWorker {
  private readonly logger = new Logger('db-worker');
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly analysis: AnalysisService,
    private readonly pollMs = 2_000,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.log('analysis worker ready (database queue)');
    this.loop = (async () => {
      while (this.running) {
        let worked = false;
        try {
          worked = await this.runOnce();
        } catch (err) {
          this.logger.error(`queue error: ${(err as Error).message}`);
        }
        if (!worked && this.running) await new Promise((r) => setTimeout(r, this.pollMs));
      }
    })();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  /** Claims and processes one due job; false when none is due. */
  async runOnce(): Promise<boolean> {
    const [job] = await this.prisma.$queryRaw<Array<{ id: string; analysisAttempts: number }>>`
      UPDATE conversation_sessions
         SET "analysisLockedUntil" = now() + make_interval(mins => ${LOCK_MINUTES}),
             "analysisAttempts" = "analysisAttempts" + 1
       WHERE id = (SELECT id FROM conversation_sessions
                    WHERE "analysisNextAt" IS NOT NULL AND "analysisNextAt" <= now()
                      AND ("analysisLockedUntil" IS NULL OR "analysisLockedUntil" < now())
                    ORDER BY "analysisNextAt"
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1)
   RETURNING id, "analysisAttempts"`;
    if (!job) return false;

    const done = { analysisNextAt: null, analysisLockedUntil: null };
    try {
      await this.analysis.analyse(job.id);
      await this.prisma.conversationSession.updateMany({ where: { id: job.id }, data: done });
    } catch (err) {
      const message = (err as Error).message;
      const retryable = err instanceof RetryableAnalysisError || (err instanceof EvaluationProviderError && err.retryable);
      if (retryable && job.analysisAttempts < MAX_ATTEMPTS) {
        this.logger.warn(`job ${job.id} attempt ${job.analysisAttempts} failed: ${message}`);
        await this.prisma.conversationSession.updateMany({
          where: { id: job.id },
          data: { analysisStatus: 'PENDING', analysisNextAt: new Date(Date.now() + backoffMs(job.analysisAttempts)), analysisLockedUntil: null },
        });
      } else {
        await this.analysis.markFailed(job.id, message);
        await this.prisma.conversationSession.updateMany({ where: { id: job.id }, data: done });
      }
    }
    return true;
  }
}
