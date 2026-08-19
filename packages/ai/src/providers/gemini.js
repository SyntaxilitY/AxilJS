"use strict";
/**
 * Google Gemini Provider.
 * Supports Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0 Flash.
 * Pure Node.js https - no SDK required.
 *
 * Usage:
 *   const provider = new GeminiProvider({
 *     apiKey: process.env.GOOGLE_API_KEY
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
class GeminiProvider {
    name = 'gemini';
    defaultModel = 'gemini-1.5-flash';
    apiKey;
    baseUrl;
    timeoutMs;
    constructor(options) {
        if (!options.apiKey) {
            throw new Error('Google API key required.\n' +
                'Set GOOGLE_API_KEY in your .env file.');
        }
        this.apiKey = options.apiKey;
        this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
        this.timeoutMs = options.timeoutMs || 60000;
    }
    async complete(options) {
        const model = options.model || this.defaultModel;
        const body = this.buildRequestBody(options);
        const data = await this.post(`/models/${model}:generateContent?key=${this.apiKey}`, body);
        const candidate = data.candidates?.[0];
        const content = candidate?.content?.parts
            ?.filter((p) => p.text)
            ?.map((p) => p.text)
            ?.join('') || '';
        return {
            content,
            finishReason: this.mapFinishReason(candidate?.finishReason),
            usage: {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata?.totalTokenCount || 0
            },
            model
        };
    }
    async *stream(options) {
        const model = options.model || this.defaultModel;
        const body = this.buildRequestBody(options);
        let fullContent = '';
        const lines = await this.postStream(`/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`, body);
        for await (const line of lines) {
            if (!line.startsWith('data: '))
                continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr)
                continue;
            try {
                const chunk = JSON.parse(jsonStr);
                const delta = chunk.candidates?.[0]?.content?.parts
                    ?.filter((p) => p.text)
                    ?.map((p) => p.text)
                    ?.join('') || '';
                if (delta) {
                    fullContent += delta;
                    yield { delta, done: false };
                }
                const finishReason = chunk.candidates?.[0]?.finishReason;
                if (finishReason === 'STOP' || finishReason === 'MAX_TOKENS') {
                    yield {
                        delta: '',
                        done: true,
                        response: {
                            content: fullContent,
                            finishReason: 'stop',
                            usage: {
                                promptTokens: chunk.usageMetadata?.promptTokenCount || 0,
                                completionTokens: chunk.usageMetadata?.candidatesTokenCount || 0,
                                totalTokens: chunk.usageMetadata?.totalTokenCount || 0
                            },
                            model
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
        const inputs = Array.isArray(options.input) ? options.input : [options.input];
        const model = options.model || 'text-embedding-004';
        const embeddings = [];
        for (const text of inputs) {
            const data = await this.post(`/models/${model}:embedContent?key=${this.apiKey}`, { content: { parts: [{ text }] } });
            embeddings.push(data.embedding?.values || []);
        }
        return {
            embeddings,
            model,
            usage: { totalTokens: inputs.join(' ').split(' ').length }
        };
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    buildRequestBody(options) {
        // Convert messages to Gemini format
        const contents = options.messages
            .filter(m => m.role !== 'system')
            .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        // System prompt
        const systemMsg = options.messages.find(m => m.role === 'system');
        const systemInstruction = options.system || systemMsg?.content;
        const body = { contents };
        if (systemInstruction) {
            body.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }
        body.generationConfig = {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens,
            topP: options.topP
        };
        return body;
    }
    mapFinishReason(reason) {
        const map = {
            'STOP': 'stop',
            'MAX_TOKENS': 'length',
            'SAFETY': 'stop'
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
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': String(Buffer.byteLength(bodyStr))
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(`Gemini API error ${res.statusCode}: ` +
                                (parsed.error?.message || data)));
                            return;
                        }
                        resolve(parsed);
                    }
                    catch {
                        reject(new Error(`Gemini: Invalid JSON response`));
                    }
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(this.timeoutMs, () => req.destroy());
            req.write(bodyStr);
            req.end();
        });
    }
    postStream(path, body) {
        const bodyStr = JSON.stringify(body);
        const url = new URL(this.baseUrl + path);
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
                        path: url.pathname + url.search,
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
exports.GeminiProvider = GeminiProvider;
//# sourceMappingURL=gemini.js.map