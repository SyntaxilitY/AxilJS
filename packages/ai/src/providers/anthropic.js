"use strict";
/**
 * Anthropic Provider.
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku.
 * Pure Node.js https - no SDK required.
 *
 * Usage:
 *   const provider = new AnthropicProvider({
 *     apiKey: process.env.ANTHROPIC_API_KEY
 *   })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *     model: 'claude-3-5-sonnet-20241022'
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
class AnthropicProvider {
    name = 'anthropic';
    defaultModel = 'claude-3-5-haiku-20241022';
    apiKey;
    baseUrl;
    timeoutMs;
    // Anthropic API version header
    API_VERSION = '2023-06-01';
    constructor(options) {
        if (!options.apiKey) {
            throw new Error('Anthropic API key is required.\n' +
                'Set ANTHROPIC_API_KEY in your .env file.');
        }
        this.apiKey = options.apiKey;
        this.baseUrl = options.baseUrl || 'https://api.anthropic.com/v1';
        this.timeoutMs = options.timeoutMs || 60000;
    }
    async complete(options) {
        const body = this.buildRequestBody(options, false);
        const data = await this.post('/messages', body);
        // Anthropic returns content as an array of content blocks
        const textContent = data.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('');
        const toolUse = data.content
            .filter((c) => c.type === 'tool_use')
            .map((c) => ({
            id: c.id,
            name: c.name,
            arguments: c.input || {}
        }));
        return {
            content: textContent,
            toolCalls: toolUse.length > 0 ? toolUse : undefined,
            finishReason: this.mapStopReason(data.stop_reason),
            usage: {
                promptTokens: data.usage?.input_tokens || 0,
                completionTokens: data.usage?.output_tokens || 0,
                totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
            },
            model: data.model
        };
    }
    async *stream(options) {
        const body = this.buildRequestBody(options, true);
        let fullContent = '';
        let model = options.model || this.defaultModel;
        let inputTokens = 0;
        let outputTokens = 0;
        const lines = await this.postStream('/messages', body);
        for await (const line of lines) {
            if (!line.startsWith('data: '))
                continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr)
                continue;
            try {
                const event = JSON.parse(jsonStr);
                switch (event.type) {
                    case 'content_block_delta': {
                        const delta = event.delta?.text || '';
                        if (delta) {
                            fullContent += delta;
                            yield { delta, done: false };
                        }
                        break;
                    }
                    case 'message_delta': {
                        outputTokens = event.usage?.output_tokens || outputTokens;
                        break;
                    }
                    case 'message_start': {
                        model = event.message?.model || model;
                        inputTokens = event.message?.usage?.input_tokens || 0;
                        break;
                    }
                    case 'message_stop': {
                        yield {
                            delta: '',
                            done: true,
                            response: {
                                content: fullContent,
                                finishReason: 'stop',
                                usage: {
                                    promptTokens: inputTokens,
                                    completionTokens: outputTokens,
                                    totalTokens: inputTokens + outputTokens
                                },
                                model
                            }
                        };
                        return;
                    }
                }
            }
            catch {
                continue;
            }
        }
    }
    async embed(_options) {
        // Anthropic does not provide a native embeddings API
        // Use OpenAI or a dedicated embedding provider for this
        throw new Error('Anthropic does not support embeddings.\n' +
            'Use OpenAIProvider or OllamaProvider for embeddings.');
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    buildRequestBody(options, stream) {
        // Separate system messages from conversation messages
        const systemMessages = options.messages.filter(m => m.role === 'system');
        const conversationMessages = options.messages.filter(m => m.role !== 'system');
        // Anthropic accepts system as a top-level field
        const system = options.system ||
            systemMessages.map(m => m.content).join('\n') ||
            undefined;
        const body = {
            model: options.model || this.defaultModel,
            messages: conversationMessages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            max_tokens: options.maxTokens || 4096,
            stream
        };
        if (system)
            body.system = system;
        if (options.temperature !== undefined)
            body.temperature = options.temperature;
        if (options.topP !== undefined)
            body.top_p = options.topP;
        if (options.stopSequences)
            body.stop_sequences = options.stopSequences;
        // Tool definitions
        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters
            }));
        }
        return body;
    }
    mapStopReason(reason) {
        const map = {
            'end_turn': 'stop',
            'tool_use': 'tool_use',
            'max_tokens': 'length',
            'stop_sequence': 'stop'
        };
        return map[reason] || 'stop';
    }
    post(path, body) {
        return new Promise((resolve, reject) => {
            const bodyStr = JSON.stringify(body);
            const url = new URL(this.baseUrl + path);
            const req = require('https').request({
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': this.API_VERSION,
                    'Content-Length': String(Buffer.byteLength(bodyStr))
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(`Anthropic API error ${res.statusCode}: ` +
                                (parsed.error?.message || data)));
                            return;
                        }
                        resolve(parsed);
                    }
                    catch {
                        reject(new Error(`Anthropic: Invalid JSON: ${data}`));
                    }
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(this.timeoutMs, () => {
                req.destroy(new Error(`Anthropic request timed out`));
            });
            req.write(bodyStr);
            req.end();
        });
    }
    postStream(path, body) {
        const bodyStr = JSON.stringify(body);
        const url = new URL(this.baseUrl + path);
        const self = this;
        return {
            [Symbol.asyncIterator]() {
                return (async function* () {
                    const queue = [];
                    let notify = null;
                    let done = false;
                    let streamError = null;
                    let lineBuffer = '';
                    const req = require('https').request({
                        hostname: url.hostname,
                        port: 443,
                        path: url.pathname,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': self.apiKey,
                            'anthropic-version': self.API_VERSION,
                            'Content-Length': String(Buffer.byteLength(bodyStr))
                        }
                    }, (res) => {
                        res.on('data', (chunk) => {
                            lineBuffer += chunk.toString();
                            const parts = lineBuffer.split('\n');
                            lineBuffer = parts.pop() || '';
                            for (const part of parts) {
                                if (part.trim()) {
                                    queue.push(part.trim());
                                    if (notify) {
                                        notify();
                                        notify = null;
                                    }
                                }
                            }
                        });
                        res.on('end', () => {
                            done = true;
                            if (notify) {
                                notify();
                                notify = null;
                            }
                        });
                        res.on('error', (err) => {
                            streamError = err;
                            done = true;
                            if (notify) {
                                notify();
                                notify = null;
                            }
                        });
                    });
                    // ✅ CRITICAL — handle error event on req
                    req.on('error', (err) => {
                        streamError = err;
                        done = true;
                        if (notify) {
                            notify();
                            notify = null;
                        }
                    });
                    req.write(bodyStr);
                    req.end();
                    while (!done || queue.length > 0) {
                        if (queue.length > 0) {
                            yield queue.shift();
                        }
                        else if (!done) {
                            await new Promise(r => { notify = r; });
                        }
                    }
                    if (streamError)
                        throw streamError;
                })();
            }
        };
    }
}
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=anthropic.js.map