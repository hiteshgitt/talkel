import { Logger } from '@nestjs/common';
import { UnrecoverableError, Worker } from 'bullmq';
import { ANALYSIS_QUEUE_NAME, type AnalysisJob, redisConnection } from './analysis-queue.js';
import { type AnalysisService, RetryableAnalysisError } from './analysis.service.js';
import { EvaluationProviderError } from './gemini-text.js';

/**
 * Consumes the after-call analysis queue. Runs in the separate worker process, or inside the API
 * process when RUN_WORKER_IN_API is set (one always-on Cloud Run service).
 */
export function startAnalysisWorker(analysis: AnalysisService, redisUrl: string): Worker<AnalysisJob> {
  const logger = new Logger('worker');
  const worker = new Worker<AnalysisJob>(
    ANALYSIS_QUEUE_NAME,
    async (job) => {
      try {
        return await analysis.analyse(job.data.sessionId);
      } catch (err) {
        const retryable = err instanceof RetryableAnalysisError || (err instanceof EvaluationProviderError && err.retryable);
        const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if (!retryable || last) await analysis.markFailed(job.data.sessionId, (err as Error).message);
        // Non-retryable (e.g. invalid request): stop here instead of burning the remaining attempts.
        if (!retryable) throw new UnrecoverableError((err as Error).message);
        throw err;
      }
    },
    { connection: redisConnection(redisUrl), concurrency: 2 },
  );
  worker.on('failed', (job, err) => logger.warn(`job ${job?.id} attempt ${job?.attemptsMade} failed: ${err.message}`));
  worker.on('ready', () => logger.log('analysis worker ready'));
  return worker;
}
