/**
 * Template: realtime-chat (placeholder — being implemented)
 */

import type { ProjectTemplate } from './types'

export const realtimeChatTemplate: ProjectTemplate = {
  id: 'realtime-chat',
  title: 'realtime-chat',
  summary: 'Coming soon',
  packages: ['@axiljs/core'],
  port: 3000,
  dependencies: ctx => ({ '@axiljs/core': ctx.axilRange }),
  files: () => ({}),
  nextSteps: () => []
}
