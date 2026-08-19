"use strict";
/**
 * OpenAI Provider.
 * Supports GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo.
 * Uses the official openai npm package (peer dependency).
 *
 * Install: npm install openai
 *
 * Usage:
 *   const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *     model: 'gpt-4o'
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
// ─── OpenAI Provider ──────────────────────────────────────────────────────────
class OpenAIProvider {
    name = 'openai';
    defaultModel = 'gpt-4o-mini';
    apiKey;
    baseUrl;
    organization;
    timeoutMs;
    constructor(options) {
        if (!options.apiKey) {
            throw new Error('OpenAI API key is required.\n' +
                'Set OPENAI_API_KEY in your .env file.');
        }
        this.apiKey = options.apiKey;
        this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
        this.organization = options.organization;
        this.timeoutMs = options.timeoutMs || 60000;
    }
    // ─── Complete ─────────────────────────────────────────────────────────────────
    async complete(options) {
        const body = this.buildRequestBody(options, false);
        const data = await this.post('/chat/completions', body);
        const choice = data.choices[0];
        const message = choice.message;
        return {
            content: message.content || '',
            toolCalls: this.parseToolCalls(message.tool_calls),
            finishReason: this.mapFinishReason(choice.finish_reason),
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0
            },
            model: data.model
        };
    }
    // ─── Stream ───────────────────────────────────────────────────────────────────
    async *stream(options) {
        const body = this.buildRequestBody(options, true);
        // Use native https for streaming to avoid buffering
        const lines = await this.postStream('/chat/completions', body);
        let fullContent = '';
        let promptTokens = 0;
        let completionTokens = 0;
        let model = options.model || this.defaultModel;
        for await (const line of lines) {
            // SSE format: "data: {...}"
            if (!line.startsWith('data: '))
                continue;
            const jsonStr = line.slice(6).trim();
            // [DONE] signals end of stream
            if (jsonStr === '[DONE]') {
                yield {
                    delta: '',
                    done: true,
                    response: {
                        content: fullContent,
                        finishReason: 'stop',
                        usage: {
                            promptTokens,
                            completionTokens,
                            totalTokens: promptTokens + completionTokens
                        },
                        model
                    }
                };
                return;
            }
            try {
                const chunk = JSON.parse(jsonStr);
                const delta = chunk.choices?.[0]?.delta;
                model = chunk.model || model;
                if (delta?.content) {
                    fullContent += delta.content;
                    const streamChunk = {
                        delta: delta.content,
                        done: false
                    };
                    yield streamChunk;
                }
                // Track usage if provided mid-stream (some models do this)
                if (chunk.usage) {
                    promptTokens = chunk.usage.prompt_tokens || 0;
                    completionTokens = chunk.usage.completion_tokens || 0;
                }
            }
            catch {
                // Invalid JSON chunk - skip it
                continue;
            }
        }
    }
    // ─── Embed ────────────────────────────────────────────────────────────────────
    async embed(options) {
        const body = {
            input: options.input,
            model: options.model || 'text-embedding-3-small'
        };
        const data = await this.post('/embeddings', body);
        return {
            embeddings: data.data.map((d) => d.embedding),
            model: data.model,
            usage: { totalTokens: data.usage?.total_tokens || 0 }
        };
    }
    // ─── Internal ─────────────────────────────────────────────────────────────────
    /**
     * Build the request body for the OpenAI API.
     */
    buildRequestBody(options, stream) {
        const messages = this.buildMessages(options);
        const body = {
            model: options.model || this.defaultModel,
            messages,
            temperature: options.temperature ?? 0.7,
            stream
        };
        if (options.maxTokens)
            body.max_tokens = options.maxTokens;
        if (options.topP !== undefined)
            body.top_p = options.topP;
        if (options.stopSequences)
            body.stop = options.stopSequences;
        // Tool definitions
        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters
                }
            }));
            if (options.toolChoice) {
                body.tool_choice =
                    options.toolChoice === 'auto' || options.toolChoice === 'none'
                        ? options.toolChoice
                        : { type: 'function', function: { name: options.toolChoice.name } };
            }
        }
        return body;
    }
    /**
     * Build messages array, injecting system prompt if provided separately.
     */
    buildMessages(options) {
        const messages = [...options.messages];
        // If system prompt provided separately, prepend it
        if (options.system && !messages.find(m => m.role === 'system')) {
            messages.unshift({ role: 'system', content: options.system });
        }
        // Map to OpenAI format
        return messages.map(msg => {
            const base = { role: msg.role, content: msg.content };
            if (msg.toolCalls) {
                base.tool_calls = msg.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments)
                    }
                }));
                // Assistant messages with tool calls have null content in OpenAI API
                base.content = null;
            }
            if (msg.toolCallId) {
                base.tool_call_id = msg.toolCallId;
            }
            return base;
        });
    }
    /**
     * Parse OpenAI tool_calls format into our ToolCall format.
     */
    parseToolCalls(rawToolCalls) {
        if (!rawToolCalls || rawToolCalls.length === 0)
            return undefined;
        return rawToolCalls.map(tc => ({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}')
        }));
    }
    mapFinishReason(reason) {
        const map = {
            'stop': 'stop',
            'tool_calls': 'tool_use',
            'length': 'length',
            'content_filter': 'stop'
        };
        return map[reason] || 'stop';
    }
    /**
     * Make a POST request to the OpenAI API.
     * Pure Node.js https - no external dependencies.
     */
    post(path, body) {
        return new Promise((resolve, reject) => {
            const bodyStr = JSON.stringify(body);
            const url = new URL(this.baseUrl + path);
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Length': String(Buffer.byteLength(bodyStr))
            };
            if (this.organization) {
                headers['OpenAI-Organization'] = this.organization;
            }
            const req = require('https').request({
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname + url.search,
                method: 'POST',
                headers
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(`OpenAI API error ${res.statusCode}: ` +
                                (parsed.error?.message || data)));
                            return;
                        }
                        resolve(parsed);
                    }
                    catch {
                        reject(new Error(`OpenAI: Invalid JSON response: ${data}`));
                    }
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            // Set timeout
            req.setTimeout(this.timeoutMs, () => {
                req.destroy(new Error(`OpenAI request timed out after ${this.timeoutMs}ms`));
            });
            req.write(bodyStr);
            req.end();
        });
    }
    /**
     * Stream POST request - returns async iterable of SSE lines.
     */
    postStream(path, body) {
        const bodyStr = JSON.stringify(body);
        const url = new URL(this.baseUrl + path);
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Length': String(Buffer.byteLength(bodyStr))
        };
        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }
        return {
            [Symbol.asyncIterator]() {
                return (async function* () {
                    const lines = [];
                    let resolve = null;
                    let done = false;
                    let streamError = null;
                    let lineBuffer = '';
                    const req = require('https').request({
                        hostname: url.hostname,
                        port: url.port || 443,
                        path: url.pathname,
                        method: 'POST',
                        headers
                    }, (res) => {
                        res.on('data', (chunk) => {
                            lineBuffer += chunk.toString();
                            const parts = lineBuffer.split('\n');
                            lineBuffer = parts.pop() || '';
                            for (const part of parts) {
                                if (part.trim()) {
                                    lines.push(part.trim());
                                    if (resolve) {
                                        resolve();
                                        resolve = null;
                                    }
                                }
                            }
                        });
                        res.on('end', () => {
                            done = true;
                            if (resolve) {
                                resolve();
                                resolve = null;
                            }
                        });
                        res.on('error', (err) => {
                            streamError = err;
                            done = true;
                            if (resolve) {
                                resolve();
                                resolve = null;
                            }
                        });
                    });
                    // ✅ CRITICAL — handle error event on req
                    req.on('error', (err) => {
                        streamError = err;
                        done = true;
                        if (resolve) {
                            resolve();
                            resolve = null;
                        }
                    });
                    req.write(bodyStr);
                    req.end();
                    while (!done || lines.length > 0) {
                        if (lines.length > 0) {
                            yield lines.shift();
                        }
                        else if (!done) {
                            await new Promise(r => { resolve = r; });
                        }
                    }
                    if (streamError)
                        throw streamError;
                })();
            }
        };
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=openai.js.map