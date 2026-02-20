import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { recordHttpMetric } from '../../observability/http-metrics.registry';

type RequestWithTrace = Request & { traceId?: string };

export function requestTraceMiddleware(
  req: RequestWithTrace,
  res: Response,
  next: NextFunction,
): void {
  const logger = new Logger('HTTP');
  const startedAt = Date.now();

  const incomingTraceId = req.headers['x-trace-id'];
  const traceId =
    typeof incomingTraceId === 'string' && incomingTraceId.trim().length > 0
      ? incomingTraceId.trim()
      : randomUUID();

  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    recordHttpMetric(
      req.method,
      req.originalUrl || req.url,
      res.statusCode,
      durationMs,
    );

    const payload = {
      traceId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    };
    logger.log(JSON.stringify(payload));
  });

  next();
}
