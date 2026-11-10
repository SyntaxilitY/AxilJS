/**
 * Template: ai-assistant (placeholder — being implemented)
 */

import type { ProjectTemplate } from './types'

export const aiAssistantTemplate: ProjectTemplate = {
  id: 'ai-assistant',
  title: 'ai-assistant',
  summary: 'Coming soon',
  packages: ['@axiljs/core'],
  port: 3000,
  dependencies: ctx => ({ '@axiljs/core': ctx.axilRange }),
  files: () => ({}),
  nextSteps: () => []
}
