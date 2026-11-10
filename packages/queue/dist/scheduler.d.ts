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
export interface ParsedCron {
    minutes: number[];
    hours: number[];
    days: number[];
    months: number[];
    weekdays: number[];
    daysRestricted?: boolean;
    weekdaysRestricted?: boolean;
}
/**
 * Parse a full 5-field cron expression string into arrays of valid values.
 *
 * @param expression  5-field cron string e.g. "0 9 * * 1-5"
 */
export declare function parseCron(expression: string): ParsedCron;
/**
 * Check whether a given Date matches a parsed cron schedule.
 */
export declare function matchesCron(date: Date, cron: ParsedCron): boolean;
export interface ScheduledTask {
    id: string;
    name: string;
    expression: string;
    handler: () => void | Promise<void>;
    lastRunAt?: Date;
    runCount: number;
    enabled: boolean;
}
export declare class Scheduler extends EventEmitter {
    private tasks;
    private alignTimer?;
    private lastTickAt;
    private running;
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
    schedule(name: string, expression: string, handler: () => void | Promise<void>): this;
    /**
     * Start the scheduler.
     * Each tick is scheduled with setTimeout aligned to the next minute
     * boundary (instead of setInterval), so timer drift never accumulates.
     */
    start(): void;
    /**
     * Stop the scheduler gracefully.
     */
    stop(): void;
    /**
     * Enable or disable a specific task by name.
     */
    setEnabled(name: string, enabled: boolean): void;
    /**
     * Run a task immediately regardless of its schedule.
     * Useful for testing or manual triggers.
     *
     * @param name  Task name as registered with schedule()
     */
    runNow(name: string): Promise<void>;
    /**
     * Get all registered tasks (without internal parsed cron data).
     */
    getTasks(): ScheduledTask[];
    /**
     * Arm a timer for the next minute boundary after the current one.
     */
    private scheduleNextTick;
    /**
     * Check the given time against all task schedules.
     * Called once per minute.
     */
    private tick;
    /**
     * Execute a single task and update its metadata.
     */
    private runTask;
    /**
     * Print all registered tasks to the console on startup.
     */
    private listTasks;
}
//# sourceMappingURL=scheduler.d.ts.map