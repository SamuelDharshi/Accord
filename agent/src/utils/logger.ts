/**
 * Accord Agent — Shared Logger
 */
import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const base = `[${timestamp}] [ARCA] ${level.toUpperCase()}: ${message}`;
      return stack ? `${base}\n${stack}` : base;
    }),
  ),
  transports: [new transports.Console()],
});
