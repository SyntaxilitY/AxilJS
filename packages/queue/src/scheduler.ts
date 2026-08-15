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

// ─── Cron Parser ──────────────────────────────────────────────────────────────

interface ParsedCron {
  minutes:  number[];
  hours:    number[];
  days:     number[];
  months:   number[];
  weekdays: number[];
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

  // Step values — forward slash syntax e.g. every 15 minutes
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${field}`);
    }
    const values: number[] = [];
    for (let i = min; i <= max; i += step) values.push(i);
    return values;
  }

  // Comma-separated list
  if (field.includes(',')) {
    return field
      .split(',')
      .map(v => parseInt(v.trim(), 10))
      .filter(n => !isNaN(n) && n >= min && n <= max);
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
function parseCron(expression: string): ParsedCron {
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
    weekdays: parseCronField(parts[4], 0, 6)
  };
}

/**
 * Check whether a given Date matches a parsed cron schedule.
 */
function matchesCron(date: Date, cron: ParsedCron): boolean {
  return (
    cron.minutes.includes(date.getMinutes())    &&
    cron.hours.includes(date.getHours())        &&
    cron.days.includes(date.getDate())          &&
    cron.months.includes(date.getMonth() + 1)  && // getMonth() is 0-indexed
    cron.weekdays.includes(date.getDay())
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

export class Scheduler extends EventEmitter {
  // All registered tasks keyed by name
  private tasks = new Map<string, ScheduledTaskInternal>();

  // Interval handle for the per-minute tick
  private timer?: ReturnType<typeof setInterval>;

  // Whether the scheduler is currently running
  private running = false;

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
   * Aligns to the next minute boundary then checks every 60 seconds.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Calculate how many ms until the next full minute
    const now               = Date.now();
    const msUntilNextMinute = 60000 - (now % 60000);

    // Align to next minute then tick every 60 seconds
    setTimeout(() => {
      this.tick();
      this.timer = setInterval(() => this.tick(), 60000);
    }, msUntilNextMinute);

    console.log('\x1b[36m[@axilJS Scheduler]\x1b[0m Started');
    this.listTasks();
  }

  /**
   * Stop the scheduler gracefully.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    console.log('\x1b[36m[@axilJS Scheduler]\x1b[0m Stopped');
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
   * Check the current time against all task schedules.
   * Called once per minute.
   */
  private tick(): void {
    if (!this.running) return;

    const now = new Date();

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;

      if (matchesCron(now, task.parsed)) {
        // Run in background — don't await so other tasks aren't blocked
        this.runTask(task).catch(err => {
          console.error(
            `\x1b[31m[@axilJS Scheduler]\x1b[0m Tick error in '${task.name}':`,
            err.message
          );
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

      console.error(
        `\x1b[31m[@axilJS Scheduler]\x1b[0m Task '${task.name}' failed:`,
        err.message
      );
    }
  }

  /**
   * Print all registered tasks to the console on startup.
   */
  private listTasks(): void {
    if (this.tasks.size === 0) {
      console.log('\x1b[90m[@axilJS Scheduler]\x1b[0m No tasks registered');
      return;
    }

    console.log(
      `\x1b[90m[@axilJS Scheduler]\x1b[0m ` +
      `${this.tasks.size} task(s) registered:`
    );

    for (const task of this.tasks.values()) {
      console.log(
        `  • ${task.name.padEnd(25)} ${task.expression}`
      );
    }
  }
}