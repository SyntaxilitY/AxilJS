/**
 * AiController — demonstrates provider-independent AI semantics.
 */

import {
  tHttp, tBody, tAuth, tAIComplete, tAIModel,
  tAITokenBudget, tAIGuard, tQuota
} from '@axiljs/decorator'

export class AiController {
  @tHttp({ method: 'POST', path: '/api/ai/summarize' })
  @tAuth({ required: true })
  @tAIGuard({ policies: ['toxicity', 'pii'], action: 'block' })
  @tAIModel({ capability: 'summarization' })
  @tAITokenBudget({ maxInput: 4000, maxOutput: 500 })
  @tAIComplete({ task: 'summarization', temperature: 0.3 })
  @tQuota({ resource: 'ai.tokens', amount: 1000 })
  @tBody('text')
  async summarize(text: string) {
    // In the full ecosystem, `@axiljs/ai` reads tAIComplete/tAIModel/
    // tAITokenBudget/tAIGuard metadata and performs the actual call.
    // This example simulates the result to keep the demo dependency-free.
    return {
      summary: `Summary of ${Math.min(text?.length ?? 0, 200)} characters of input.`,
      model: 'capability:summarization'
    }
  }
}