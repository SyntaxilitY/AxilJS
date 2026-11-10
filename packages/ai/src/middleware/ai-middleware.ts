/**
 * AI middleware for AxilJS applications.
 * Provides AI-powered HTTP endpoints out of the box.
 *
 * Usage:
 *   app.post('/chat', aiChat({ provider }))
 *   app.post('/chat/stream', aiChatStream({ provider }))
 *   app.post('/embed', aiEmbed({ provider }))
 */

import { RouteHandler } from '@axiljs/common';
import { createSSE } from '@axiljs/core';
import { AIProvider, Message } from '../types';
import { Agent } from '../agents/agent';
import { Tool } from '../agents/tool';

// ─── Chat Handler ─────────────────────────────────────────────────────────────

export interface AIChatOptions {
  provider: AIProvider;
  model?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Create a chat completion route handler.
 * Accepts: POST body { messages: Message[], model?: string }
 * Returns:  { content, usage, model }
 */
export function aiChat(options: AIChatOptions): RouteHandler {
  return async (req, res) => {
    const body = req.body as any;

    if (!body?.messages || !Array.isArray(body.messages)) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Request body must include a messages array'
        }
      });
      return;
    }

    try {
      const response = await options.provider.complete({
        messages: body.messages as Message[],
        model:       body.model       || options.model,
        system:      body.system      || options.system,
        temperature: body.temperature ?? options.temperature,
        maxTokens:   body.maxTokens   || options.maxTokens
      });

      res.json({
        content:      response.content,
        finishReason: response.finishReason,
        usage:        response.usage,
        model:        response.model
      });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'AI_ERROR',
          message: (error as Error).message
        }
      });
    }
  };
}

// ─── Streaming Chat Handler ───────────────────────────────────────────────────

/**
 * Create a streaming chat completion route handler.
 * Uses Server-Sent Events to stream tokens to the client.
 * Accepts: POST body { messages: Message[] }
 * Streams:  SSE events with delta tokens
 */
export function aiChatStream(options: AIChatOptions): RouteHandler {
  return async (req, res) => {
    const body = req.body as any;

    if (!body?.messages) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'messages required' } });
      return;
    }

    const sse = createSSE(res);

    try {
      const stream = options.provider.stream({
        messages:    body.messages as Message[],
        model:       body.model    || options.model,
        system:      body.system   || options.system,
        temperature: body.temperature ?? options.temperature
      });

      for await (const chunk of stream) {
        if (!sse.isOpen) break;

        if (chunk.delta) {
          // Send each token as an SSE event
          sse.send({ delta: chunk.delta }, 'delta');
        }

        if (chunk.done && chunk.response) {
          // Send final metadata
          sse.send({
            content:      chunk.response.content,
            finishReason: chunk.response.finishReason,
            usage:        chunk.response.usage,
            model:        chunk.response.model
          }, 'done');
        }
      }
    } catch (error) {
      if (sse.isOpen) {
        sse.send({
          error: {
            code:    'AI_ERROR',
            message: (error as Error).message
          }
        }, 'error');
      }
    } finally {
      sse.close();
    }
  };
}

// ─── Embedding Handler ────────────────────────────────────────────────────────

/**
 * Create an embedding route handler.
 * Accepts: POST body { input: string | string[], model?: string }
 * Returns:  { embeddings, model, usage }
 */
export function aiEmbed(options: { provider: AIProvider; model?: string }): RouteHandler {
  return async (req, res) => {
    const body = req.body as any;

    if (!body?.input) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'input field required' }
      });
      return;
    }

    try {
      const response = await options.provider.embed({
        input: body.input,
        model: body.model || options.model
      });

      res.json({
        embeddings: response.embeddings,
        model:      response.model,
        usage:      response.usage,
        dimensions: response.embeddings[0]?.length || 0
      });
    } catch (error) {
      res.status(500).json({
        error: { code: 'AI_ERROR', message: (error as Error).message }
      });
    }
  };
}

// ─── Agent Handler ────────────────────────────────────────────────────────────

/**
 * Create an agent route handler.
 * Accepts: POST body { task: string, context?: Message[] }
 * Returns:  { response, steps, usage }
 */
export function aiAgent(options: {
  provider: AIProvider;
  tools: Tool[];
  systemPrompt?: string;
  maxIterations?: number;
  model?: string;
  stream?: boolean;
}): RouteHandler {
  const agent = new Agent({
    provider:      options.provider,
    tools:         options.tools,
    systemPrompt:  options.systemPrompt,
    maxIterations: options.maxIterations,
    model:         options.model
  });

  return async (req, res) => {
    const body = req.body as any;

    if (!body?.task) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'task field required' }
      });
      return;
    }

    // Streaming agent
    if (options.stream) {
      const sse = createSSE(res);

      try {
        for await (const step of agent.runStream(body.task, body.context || [])) {
          if (!sse.isOpen) break;

          sse.send({
            iteration: step.iteration,
            thought:   step.thought,
            toolCalls: step.toolCalls,
            toolResults: step.toolResults?.map(r => ({
              toolName: r.toolName,
              result:   r.result
            })),
            finalAnswer: step.finalAnswer,
            done: step.done
          }, 'step');

          if (step.done) break;
        }
      } catch (error) {
        if (sse.isOpen) {
          sse.send({ error: (error as Error).message }, 'error');
        }
      } finally {
        sse.close();
      }
      return;
    }

    // Non-streaming agent
    try {
      const result = await agent.run(body.task, body.context || []);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: { code: 'AI_ERROR', message: (error as Error).message }
      });
    }
  };
}