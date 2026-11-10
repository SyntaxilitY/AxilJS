/**
 * Template: background-jobs (placeholder — being implemented)
 */

import type { ProjectTemplate } from './types'

export const backgroundJobsTemplate: ProjectTemplate = {
  id: 'background-jobs',
  title: 'background-jobs',
  summary: 'Coming soon',
  packages: ['@axiljs/core'],
  port: 3000,
  dependencies: ctx => ({ '@axiljs/core': ctx.axilRange }),
  files: () => ({}),
  nextSteps: () => []
}
