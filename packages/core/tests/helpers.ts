import { vi } from 'vitest';
import { Application } from '../src/application';
import type { AppConfig } from '@axiljs/common';

const running: Application[] = [];

/** Create an app with request logging off (and the startup banner muted). */
export function createApp(config: AppConfig = {}): Application {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  return new Application({ logging: false, ...config });
}

/** Listen on a random port and return the base URL. */
export async function start(app: Application): Promise<string> {
  const { port } = await app.listen(0, '127.0.0.1');
  running.push(app);
  return `http://127.0.0.1:${port}`;
}

/** Close every server started with start(). Call from afterEach. */
export async function stopAll(): Promise<void> {
  while (running.length) {
    const app = running.pop()!;
    app.getServer()?.closeAllConnections();
    await app.close();
  }
  vi.restoreAllMocks();
}
