/**
 * Registry of `axil create --template <id>` project templates.
 * Add a template: write ./<id>.ts exporting a ProjectTemplate, list it here.
 */

import type { ProjectTemplate } from './types'
import { minimalTemplate }        from './minimal'
import { restApiTemplate }        from './rest-api'
import { realtimeChatTemplate }   from './realtime-chat'
import { backgroundJobsTemplate } from './background-jobs'
import { aiAssistantTemplate }    from './ai-assistant'
import { saasApiTemplate }        from './saas-api'

export type { ProjectTemplate, TemplateContext } from './types'

export const TEMPLATES: ProjectTemplate[] = [
  minimalTemplate,
  restApiTemplate,
  realtimeChatTemplate,
  backgroundJobsTemplate,
  aiAssistantTemplate,
  saasApiTemplate
]

export const TEMPLATE_IDS = TEMPLATES.map(t => t.id)

export function findTemplate(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find(t => t.id === id)
}
