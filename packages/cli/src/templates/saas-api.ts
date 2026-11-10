/**
 * Template: saas-api (placeholder — being implemented)
 */

import type { ProjectTemplate } from './types'

export const saasApiTemplate: ProjectTemplate = {
  id: 'saas-api',
  title: 'saas-api',
  summary: 'Coming soon',
  packages: ['@axiljs/core'],
  port: 3000,
  dependencies: ctx => ({ '@axiljs/core': ctx.axilRange }),
  files: () => ({}),
  nextSteps: () => []
}
