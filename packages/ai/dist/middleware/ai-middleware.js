"use strict";
/**
 * AI middleware for AxilJS applications.
 * Provides AI-powered HTTP endpoints out of the box.
 *
 * Usage:
 *   app.post('/chat', aiChat({ provider }))
 *   app.post('/chat/stream', aiChatStream({ provider }))
 *   app.post('/embed', aiEmbed({ provider }))
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiChat = aiChat;
exports.aiChatStream = aiChatStream;
exports.aiEmbed = aiEmbed;
exports.aiAgent = aiAgent;
const core_1 = require("@axiljs/core");
const agent_1 = require("../agents/agent");
// ─── Error mapping ────────────────────────────────────────────────────────────
/**
 * Map an error to an HTTP status + code. 4xx axilErrors (e.g.
 * AIBudgetExceededError -> 429, AIPolicyViolationError -> 422) keep their
 * status and code; anything else is a 500 'AI_ERROR'.
 */
function errorReply(error) {
    const e = error;
    if (typeof e?.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500 && typeof e.code === 'string') {
        return {
            status: e.statusCode,
            code: e.code,
            retryAfterMs: typeof e.retryAfterMs === 'number' ? e.retryAfterMs : undefined
        };
    }
    return { status: 500, code: 'AI_ERROR' };
}
function sendError(res, error) {
    const { status, code, retryAfterMs } = errorReply(error);
    if (status === 429 && retryAfterMs !== undefined)
        res.header('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    res.status(status).json({ error: { code, message: error.message } });
}
/**
 * Create a chat completion route handler.
 * Accepts: POST body { messages: Message[], model?: string }
 * Returns:  { content, usage, model }
 */
function aiChat(options) {
    return async (req, res) => {
        const body = req.body;
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
                messages: body.messages,
                model: body.model || options.model,
                system: body.system || options.system,
                temperature: body.temperature ?? options.temperature,
                maxTokens: body.maxTokens || options.maxTokens
            });
            res.json({
                content: response.content,
                finishReason: response.finishReason,
                usage: response.usage,
                model: response.model
            });
        }
        catch (error) {
            sendError(res, error);
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
function aiChatStream(options) {
    return async (req, res) => {
        const body = req.body;
        if (!body?.messages) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'messages required' } });
            return;
        }
        const sse = (0, core_1.createSSE)(res);
        try {
            const stream = options.provider.stream({
                messages: body.messages,
                model: body.model || options.model,
                system: body.system || options.system,
                temperature: body.temperature ?? options.temperature
            });
            for await (const chunk of stream) {
                if (!sse.isOpen)
                    break;
                if (chunk.delta) {
                    // Send each token as an SSE event
                    sse.send({ delta: chunk.delta }, 'delta');
                }
                if (chunk.done && chunk.response) {
                    // Send final metadata
                    sse.send({
                        content: chunk.response.content,
                        finishReason: chunk.response.finishReason,
                        usage: chunk.response.usage,
                        model: chunk.response.model
                    }, 'done');
                }
            }
        }
        catch (error) {
            if (sse.isOpen) {
                sse.send({
                    error: {
                        code: errorReply(error).code,
                        message: error.message
                    }
                }, 'error');
            }
        }
        finally {
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
function aiEmbed(options) {
    return async (req, res) => {
        const body = req.body;
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
                model: response.model,
                usage: response.usage,
                dimensions: response.embeddings[0]?.length || 0
            });
        }
        catch (error) {
            sendError(res, error);
        }
    };
}
// ─── Agent Handler ────────────────────────────────────────────────────────────
/**
 * Create an agent route handler.
 * Accepts: POST body { task: string, context?: Message[] }
 * Returns:  { response, steps, usage }
 */
function aiAgent(options) {
    const agent = new agent_1.Agent({
        provider: options.provider,
        tools: options.tools,
        systemPrompt: options.systemPrompt,
        maxIterations: options.maxIterations,
        model: options.model
    });
    return async (req, res) => {
        const body = req.body;
        if (!body?.task) {
            res.status(400).json({
                error: { code: 'BAD_REQUEST', message: 'task field required' }
            });
            return;
        }
        // Streaming agent
        if (options.stream) {
            const sse = (0, core_1.createSSE)(res);
            try {
                for await (const step of agent.runStream(body.task, body.context || [])) {
                    if (!sse.isOpen)
                        break;
                    sse.send({
                        iteration: step.iteration,
                        thought: step.thought,
                        toolCalls: step.toolCalls,
                        toolResults: step.toolResults?.map(r => ({
                            toolName: r.toolName,
                            result: r.result
                        })),
                        finalAnswer: step.finalAnswer,
                        done: step.done
                    }, 'step');
                    if (step.done)
                        break;
                }
            }
            catch (error) {
                if (sse.isOpen) {
                    sse.send({ error: error.message }, 'error');
                }
            }
            finally {
                sse.close();
            }
            return;
        }
        // Non-streaming agent
        try {
            const result = await agent.run(body.task, body.context || []);
            res.json(result);
        }
        catch (error) {
            sendError(res, error);
        }
    };
}
//# sourceMappingURL=ai-middleware.js.map