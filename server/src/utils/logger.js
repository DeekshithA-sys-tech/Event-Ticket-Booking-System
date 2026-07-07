/**
 * @file logger.js
 * @description Structured application logger using Winston.
 *
 * WHY WINSTON OVER console.log?
 * ------------------------------
 * console.log is great for scripts. In production, it's a liability:
 *  - Logs are unstructured plain text — impossible to query or aggregate
 *  - No log levels — you can't silence debug noise in production
 *  - No timestamps, no context, no metadata
 *
 * Winston gives us:
 *  - Log levels: error > warn > info > http > debug
 *  - JSON output in production → ingest into Datadog, CloudWatch, etc.
 *  - Colorised, readable output in development
 *  - Separate transports (console, file, remote) configurable per environment
 *
 * STRUCTURED LOGGING:
 * -------------------
 * Every log entry in production is a JSON object:
 * { level: "info", message: "[DB] Connected", timestamp: "2024-01-15T10:30:00Z" }
 * This means you can run: SELECT * FROM logs WHERE level = 'error' AND timestamp > '...'
 *
 * Morgan (HTTP request logger) is wired to this logger in logger.middleware.js,
 * so ALL logs flow through a single pipeline.
 */

import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, colorize, printf, json, errors } = winston.format;

// ─── Custom Console Format ────────────────────────────────────────────────────
// Used in development for human-readable colorised output
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }), // Include stack trace for Error objects
  printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      // For error objects, print the stack trace
      return `${timestamp} [${level}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level}]: ${message}`;
  })
);

// ─── Production JSON Format ───────────────────────────────────────────────────
// Machine-readable JSON — ideal for log aggregation services
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ─── Transports ───────────────────────────────────────────────────────────────
// A transport defines WHERE logs are sent
const transports = [
  // Always log to console
  new winston.transports.Console({
    format: env.isDev ? devFormat : prodFormat,
  }),
];

// In production, also write to rotating log files
// (In a containerised deployment you'd skip files and stream to stdout only)
if (env.isProd) {
  transports.push(
    // Error-level only log file for quick error scanning
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: prodFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // Combined log file (all levels)
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: prodFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
}

// ─── Logger Instance ──────────────────────────────────────────────────────────
export const logger = winston.createLogger({
  // Log level hierarchy: error > warn > info > http > debug
  // Setting 'debug' in development shows all levels
  // Setting 'warn' in production shows only warn and error
  level: env.isDev ? 'debug' : 'warn',
  defaultMeta: {
    service: 'event-ticket-api', // Useful when aggregating logs from multiple services
  },
  transports,
  // Don't crash the process on uncaught exceptions — just log them
  exceptionHandlers: [new winston.transports.Console()],
  rejectionHandlers: [new winston.transports.Console()],
});

/**
 * Creates a child logger with additional context metadata.
 * Use this in services to tag logs with a module name.
 *
 * @param {string} module - Module name for contextual logging
 * @returns {winston.Logger} Child logger instance
 *
 * @example
 * const log = createModuleLogger('AuthService');
 * log.info('User registered'); // → [AuthService] User registered
 */
export const createModuleLogger = (module) => {
  return logger.child({ module });
};
