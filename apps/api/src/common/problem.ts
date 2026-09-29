import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ProblemDetails } from '@speakai/contracts';
import type { Response } from 'express';
import type { z } from 'zod';

/** An HTTP error carrying a stable machine-readable `code` (RFC 9457 problem details). */
export class ProblemException extends HttpException {
  constructor(status: HttpStatus, code: string, title: string, detail?: string) {
    const body: ProblemDetails = { type: 'about:blank', title, status, code, ...(detail ? { detail } : {}) };
    super(body, status);
  }
}

/** Validates an unknown request body against a Zod schema, or throws 400 VALIDATION_FAILED. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`).join('; ');
    throw new ProblemException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Request validation failed', detail);
  }
  return result.data;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let problem: ProblemDetails;

    if (exception instanceof ProblemException) {
      problem = exception.getResponse() as ProblemDetails;
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      problem = { type: 'about:blank', title: exception.message, status, code: HttpStatus[status] ?? 'HTTP_ERROR' };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      problem = {
        type: 'about:blank',
        title: 'Internal server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL',
      };
    }

    res.status(problem.status).type('application/problem+json').json(problem);
  }
}
