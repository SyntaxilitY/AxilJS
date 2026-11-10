/**
 * minimal
 * Entry point: load .env, build the app, listen.
 */

import { loadEnv } from '@axiljs/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

loadEnv()

const config = loadConfig()
const app    = createApp(config)

await app.listen()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}
