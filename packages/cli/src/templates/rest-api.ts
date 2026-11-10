/**
 * Template: rest-api (placeholder — being implemented)
 */

import type { ProjectTemplate } from './types'

export const restApiTemplate: ProjectTemplate = {
  id: 'rest-api',
  title: 'rest-api',
  summary: 'Coming soon',
  packages: ['@axiljs/core'],
  port: 3000,
  dependencies: ctx => ({ '@axiljs/core': ctx.axilRange }),
  files: () => ({}),
  nextSteps: () => []
}
