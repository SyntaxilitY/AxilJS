/**
 * Task Scheduler.
 * Run jobs on a schedule using cron-like expressions.
 * Zero external dependencies.
 *
 * Cron format: minute hour day month weekday
 *
 * Examples:
 *   "0 * * * *"     Every hour at minute 0
 *   "0 9 * * 1-5"   Weekdays at 9:00 AM
 *   "0 0 1 * *"     First day of every month at midnight
 *
 * Step syntax uses a forward slash.
 * Example: every 15 minutes = minute field set to slash-15
 *
 * Usage:
 *   const scheduler = new Scheduler()
 *   scheduler.schedule('cleanup', '0 2 * * *', async () => {
 *     await cleanupOldLogs()
 *   })
 *   scheduler.start()
 */

import { EventEmitter } from 'events';
import { QueueLoggerOption, LogSink, createLogSink } from './logger';

// ─── Cron Parser ──────────────────────────────────────────────────────────────

export interface ParsedCron {
  minutes:  number[];
  hours:    number[];
  days:     number[];
  months:   number[];
  weekdays: number[];
  // Whether day-of-month / day-of-week were restricted (not starting with '*').
  // When both are restricted, standard cron matches if EITHER matches.
  daysRestricted?:     boolean;
  weekdaysRestricted?: boolean;
}

/**
 * Parse a single cron field into an array of valid numeric values.
 *
 * Supports:
 *   *       All values in range
 *   n       Single value
 *   n-m     Range inclusive
 *   a,b,c   Comma-separated list
 *   /n      Step — every nth value (using forward slash)
 */
function parseCronField(field: string, min: number, max: number): number[] {
  // All values
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  // Comma-separated list — each item may itself be a value, range or step
  if (field.includes(',')) {
    const values = field.split(',').flatMap(v => {
      try {
        return parseCronField(v.trim(), min, max);
      } catch {
        return [];
      }
    });
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }

  // Step values — forward slash syntax e.g. every 15 minutes,
  // also on a range ("0-30/5") or from a start value ("5/15")
  if (field.includes('/')) {
    const [base, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${field}`);
    }
    let start = min;
    let end = max;
    if (base !== '*') {
      const [startStr, endStr] = base.split('-');
      start = parseInt(startStr, 10);
      end = endStr !== undefined ? parseInt(endStr, 10) : max;
      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid cron step: ${field}`);
      }
    }
    const values: number[] = [];
    for (let i = start; i <= end; i += step) {
      if (i >= min && i <= max) values.push(i);
    }
    return values;
  }

  // Range
  if (field.includes('-')) {
    const [startStr, endStr] = field.split('-');
    const start = parseInt(startStr, 10);
    const end   = parseInt(endStr, 10);
    const values: number[] = [];
    for (let i = start; i <= end; i++) {
      if (i >= min && i <= max) values.push(i);
    }
    return values;
  }

  // Single value
  const num = parseInt(field, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid cron field value: ${field}`);
  }
  return (num >= min && num <= max) ? [num] : [];
}

/**
 * Parse a full 5-field cron expression string into arrays of valid values.
 *
 * @param expression  5-field cron string e.g. "0 9 * * 1-5"
 */
export function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression: "${expression}". ` +
      `Must have exactly 5 fields: minute hour day month weekday`
    );
  }

  return {
    minutes:  parseCronField(parts[0], 0, 59),
    hours:    parseCronField(parts[1], 0, 23),
    days:     parseCronField(parts[2], 1, 31),
    months:   parseCronField(parts[3], 1, 12),
    // Accept 7 as an alias for Sunday (standard cron)
    weekdays: Array.from(new Set(parseCronField(parts[4], 0, 7).map(d => (d === 7 ? 0 : d)))),
    daysRestricted:     !parts[2].startsWith('*'),
    weekdaysRestricted: !parts[4].startsWith('*')
  };
}

/**
 * Validate a 5-field cron expression without scheduling anything.
 * Returns true if `validateCron` reports no error.
 *
 *   isValidCron('0 9 * * 1-5')  // true
 *   isValidCron('61 * * * *')   // false (no minute can ever match)
 */
export function isValidCron(expression: string): boolean {
  return validateCron(expression) === null;
}

/**
 * Validate a cron expression and return the error message, or null if valid.
 * Besides `parseCron` errors, an expression with a field that matches no
 * value at all (e.g. minute "61") is reported, since it could never fire.
 */
export function validateCron(expression: string): string | null {
  if (typeof expression !== 'string') return 'Cron expression must be a string';
  let parsed: ParsedCron;
  try {
    parsed = parseCron(expression);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const fields: Array<[string, number[]]> = [
    ['minute', parsed.minutes],
    ['hour', parsed.hours],
    ['day', parsed.days],
    ['month', parsed.months],
    ['weekday', parsed.weekdays]
  ];
  for (const [name, values] of fields) {
    if (values.length === 0) {
      return `Invalid cron expression: "${expression}". The ${name} field matches no values`;
    }
  }
  return null;
}

/**
 * Check whether a given Date matches a parsed cron schedule.
 */
export function matchesCron(date: Date, cron: ParsedCron): boolean {
  const dayOfMonth = cron.days.includes(date.getDate());
  const dayOfWeek  = cron.weekdays.includes(date.getDay());

  // Standard (Vixie) cron: if both DOM and DOW are restricted, either may match
  const dayMatches = cron.daysRestricted && cron.weekdaysRestricted
    ? dayOfMonth || dayOfWeek
    : dayOfMonth && dayOfWeek;

  return (
    cron.minutes.includes(date.getMinutes())    &&
    cron.hours.includes(date.getHours())        &&
    cron.months.includes(date.getMonth() + 1)  && // getMonth() is 0-indexed
    dayMatches
  );
}

// ─── Scheduled Task ───────────────────────────────────────────────────────────

export interface ScheduledTask {
  // Unique task identifier
  id: string;

  // Human-readable name
  name: string;

  // Original cron expression string
  expression: string;

  // The function to execute
  handler: () => void | Promise<void>;

  // When this task last ran
  lastRunAt?: Date;

  // Total times this task has run
  runCount: number;

  // Whether this task is active
  enabled: boolean;
}

// Internal type that includes the parsed cron
type ScheduledTaskInternal = ScheduledTask & { parsed: ParsedCron };

// ─── Scheduler ────────────────────────────────────────────────────────────────

export interface SchedulerOptions {
  // Where start/stop/task-failure messages go.
  // Default: console (unchanged). false: silent. { info, warn }: your logger
  // (plain text, no ANSI; errors are reported via warn).
  // Failures are always observable via the 'failed' event.
  logger?: QueueLoggerOption;
}

export class Scheduler extends EventEmitter {
  // All registered tasks keyed by name
  private tasks = new Map<string, ScheduledTaskInternal>();

  // Timeout handle for the next minute-boundary tick
  private alignTimer?: ReturnType<typeof setTimeout>;

  // Epoch ms of the last minute boundary that was ticked
  private lastTickAt = 0;

  // Whether the scheduler is currently running
  private running = false;

  private log: LogSink;

  constructor(options: SchedulerOptions = {}) {
    super();
    this.log = createLogSink(options.logger, '[AxilJS Scheduler]');
  }

  /**
   * Register a task to run on a cron schedule.
   *
   * @param name        Unique task name
   * @param expression  Cron expression — 5 fields
   * @param handler     Async function to execute
   *
   * Usage:
   *   scheduler.schedule('cleanup', '0 2 * * *', cleanupLogs)
   *   scheduler.schedule('report',  '0 9 * * 1-5', sendReport)
   */
  schedule(
    name: string,
    expression: string,
    handler: () => void | Promise<void>
  ): this {
    const parsed = parseCron(expression);

    this.tasks.set(name, {
      id:         name,
      name,
      expression,
      handler,
      runCount:   0,
      enabled:    true,
      parsed
    });

    return this;
  }

  /**
   * Start the scheduler.
   * Each tick is scheduled with setTimeout aligned to the next minute
   * boundary (instead of setInterval), so timer drift never accumulates.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.scheduleNextTick();

    this.log('info', 'Started');
    this.listTasks();
  }

  /**
   * Stop the scheduler gracefully.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.alignTimer) {
      clearTimeout(this.alignTimer);
      this.alignTimer = undefined;
    }

    this.log('info', 'Stopped');
  }

  /**
   * Enable or disable a specific task by name.
   */
  setEnabled(name: string, enabled: boolean): void {
    const task = this.tasks.get(name);
    if (task) {
      task.enabled = enabled;
    }
  }

  /**
   * Run a task immediately regardless of its schedule.
   * Useful for testing or manual triggers.
   *
   * @param name  Task name as registered with schedule()
   */
  async runNow(name: string): Promise<void> {
    const task = this.tasks.get(name);

    if (!task) {
      throw new Error(
        `Scheduler: task '${name}' not found. ` +
        `Registered tasks: ${Array.from(this.tasks.keys()).join(', ')}`
      );
    }

    await this.runTask(task);
  }

  /**
   * Get all registered tasks (without internal parsed cron data).
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values()).map(
      ({ parsed: _parsed, ...task }) => task
    );
  }

  /**
   * Arm a timer for the next minute boundary after the current one.
   */
  private scheduleNextTick(): void {
    const now = Date.now();
    // Next boundary strictly after both "now" and the last ticked boundary
    let target = now - (now % 60000) + 60000;
    if (target <= this.lastTickAt) target = this.lastTickAt + 60000;

    this.alignTimer = setTimeout(() => {
      this.alignTimer = undefined;
      if (!this.running) return;
      this.lastTickAt = target;
      // Timers may fire a hair early; evaluate the minute we were aiming for
      this.tick(new Date(Math.max(Date.now(), target)));
      if (this.running) this.scheduleNextTick();
    }, target - now);
  }

  /**
   * Check the given time against all task schedules.
   * Called once per minute.
   */
  private tick(now: Date = new Date()): void {
    if (!this.running) return;

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;

      if (matchesCron(now, task.parsed)) {
        // Run in background — don't await so other tasks aren't blocked
        this.runTask(task).catch(err => {
          this.log('error', `Tick error in '${task.name}': ${err?.message ?? err}`, '\x1b[31m');
        });
      }
    }
  }

  /**
   * Execute a single task and update its metadata.
   */
  private async runTask(task: ScheduledTaskInternal): Promise<void> {
    const start = Date.now();

    try {
      await task.handler();

      task.lastRunAt = new Date();
      task.runCount++;

      const duration = Date.now() - start;
      this.emit('completed', task.name, duration);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      this.emit('failed', task.name, err);

      this.log('error', `Task '${task.name}' failed: ${err.message}`, '\x1b[31m');
    }
  }

  /**
   * Print all registered tasks to the console on startup.
   */
  private listTasks(): void {
    if (this.tasks.size === 0) {
      this.log('info', 'No tasks registered', '\x1b[90m');
      return;
    }

    this.log('info', `${this.tasks.size} task(s) registered:`, '\x1b[90m');

    for (const task of this.tasks.values()) {
      this.log('info', `  • ${task.name.padEnd(25)} ${task.expression}`, null);
    }
  }
}