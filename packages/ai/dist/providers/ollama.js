"use strict";
/**
 * Ollama Provider.
 * Run LLMs locally: Llama 3, Mistral, Phi-3, Gemma, DeepSeek, etc.
 * No API key required. Requires Ollama to be running locally.
 *
 * Install Ollama: https://ollama.ai
 * Pull a model:   ollama pull llama3.2
 *
 * Usage:
 *   const provider = new OllamaProvider({ model: 'llama3.2' })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }]
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
class OllamaProvider {
    name = 'ollama';
    defaultModel;
    baseUrl;
    timeoutMs;
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:11434';
        this.defaultModel = options.model || 'llama3.2';
        this.timeoutMs = options.timeoutMs || 120000;
    }
    async complete(options) {
        const model = options.model || this.defaultModel;
        const body = {
            model,
            messages: this.formatMessages(options),
            stream: false,
            options: {
                temperature: options.temperature ?? 0.7,
                top_p: options.topP ?? 1,
                num_predict: options.maxTokens
            }
        };
        const data = await this.post('/api/chat', body);
        return {
            content: data.message?.content || '',
            finishReason: data.done ? 'stop' : 'length',
            usage: {
                promptTokens: data.prompt_eval_count || 0,
                completionTokens: data.eval_count || 0,
                totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
            },
            model: data.model || model
        };
    }
    async *stream(options) {
        const model = options.model || this.defaultModel;
        const body = {
            model,
            messages: this.formatMessages(options),
            stream: true,
            options: {
                temperature: options.temperature ?? 0.7,
                num_predict: options.maxTokens
            }
        };
        let fullContent = '';
        let promptTokens = 0;
        let completionTokens = 0;
        const lines = await this.postStream('/api/chat', body);
        for await (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const chunk = JSON.parse(line);
                const delta = chunk.message?.content || '';
                if (delta) {
                    fullContent += delta;
                    yield { delta, done: false };
                }
                if (chunk.done) {
                    promptTokens = chunk.prompt_eval_count || 0;
                    completionTokens = chunk.eval_count || 0;
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
                            model: chunk.model || model
                        }
                    };
                    return;
                }
            }
            catch {
                continue;
            }
        }
    }
    async embed(options) {
        const inputs = Array.isArray(options.input)
            ? options.input
            : [options.input];
        const model = options.model || 'nomic-embed-text';
        // Ollama processes embeddings one at a time
        const embeddings = [];
        let totalTokens = 0;
        for (const input of inputs) {
            const data = await this.post('/api/embeddings', { model, prompt: input });
            embeddings.push(data.embedding);
            totalTokens += input.split(' ').length; // Approximate
        }
        return {
            embeddings,
            model,
            usage: { totalTokens }
        };
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    formatMessages(options) {
        const messages = [...options.messages];
        if (options.system && !messages.find(m => m.role === 'system')) {
            messages.unshift({ role: 'system', content: options.system });
        }
        return messages.map(m => ({ role: m.role, content: m.content }));
    }
    post(path, body) {
        return new Promise((resolve, reject) => {
            const bodyStr = JSON.stringify(body);
            const url = new URL(this.baseUrl + path);
            const isHttps = url.protocol === 'https:';
            const transport = isHttps ? require('https') : require('http');
            let responded = false;
            const req = transport.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 11434),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': String(Buffer.byteLength(bodyStr))
                }
            }, (res) => {
                responded = true;
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    }
                    catch {
                        reject(new Error(`Ollama: Invalid JSON response. ` +
                            `Is Ollama running at ${this.baseUrl}? ` +
                            `Start with: ollama serve`));
                    }
                });
                res.on('error', (err) => {
                    if (!responded)
                        reject(err);
                });
            });
            // ✅ CRITICAL — always handle the error event on req
            // Without this Node.js crashes with unhandled 'error' event
            req.on('error', (err) => {
                reject(new Error(`Cannot connect to Ollama at ${this.baseUrl}.\n` +
                    `Make sure Ollama is running: ollama serve\n` +
                    `Pull model: ollama pull ${this.defaultModel}\n` +
                    `Error: ${err.message}`));
            });
            req.setTimeout(this.timeoutMs, () => {
                req.destroy(new Error(`Ollama request timed out after ${this.timeoutMs}ms. ` +
                    `Model may still be loading.`));
            });
            req.write(bodyStr);
            req.end();
        });
    }
    postStream(path, body) {
        const bodyStr = JSON.stringify(body);
        const url = new URL(this.baseUrl + path);
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? require('https') : require('http');
        return {
            [Symbol.asyncIterator]() {
                return (async function* () {
                    const queue = [];
                    let notify = null;
                    let done = false;
                    let streamError = null;
                    let lineBuffer = '';
                    const req = transport.request({
                        hostname: url.hostname,
                        port: url.port || (isHttps ? 443 : 11434),
                        path: url.pathname,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
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
                        streamError = new Error(`Cannot connect to Ollama at ${url.origin}. ` +
                            `Start Ollama with: ollama serve`);
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
exports.OllamaProvider = OllamaProvider;
//# sourceMappingURL=ollama.js.map