"use strict";
/**
 * AI Agent.
 * Autonomous agent that uses tools to complete complex tasks.
 * Implements the ReAct (Reasoning + Acting) pattern.
 *
 * The agent loop:
 *   1. Receive task
 *   2. Think: What tool should I use?
 *   3. Act: Call the tool
 *   4. Observe: See the tool result
 *   5. Repeat until task is complete
 *
 * Usage:
 *   const agent = new Agent({
 *     provider,
 *     tools: [searchTool, calculatorTool, currentDateTimeTool],
 *     systemPrompt: 'You are a helpful research assistant.',
 *     maxIterations: 10
 *   })
 *
 *   const result = await agent.run('What is 2^10 and what is today\'s date?')
 *   console.log(result.response)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
// ─── Default System Prompt ────────────────────────────────────────────────────
const DEFAULT_AGENT_PROMPT = `You are a capable AI assistant with access to tools.

When solving a task:
1. Think about what information or actions are needed
2. Use the available tools when helpful
3. Analyze tool results before proceeding
4. Provide a clear, complete final answer

Be efficient - only call tools when necessary.
If you can answer from your training, do so directly.`;
// ─── Agent ────────────────────────────────────────────────────────────────────
class Agent {
    provider;
    tools;
    options;
    constructor(options) {
        this.provider = options.provider;
        // Index tools by name for O(1) lookup
        this.tools = new Map(options.tools.map(tool => [tool.definition.name, tool]));
        this.options = {
            systemPrompt: options.systemPrompt || DEFAULT_AGENT_PROMPT,
            maxIterations: options.maxIterations ?? 10,
            model: options.model || options.provider.defaultModel,
            temperature: options.temperature ?? 0.1,
            onStep: options.onStep
        };
    }
    // ─── Run ──────────────────────────────────────────────────────────────────────
    /**
     * Run the agent on a task.
     * Returns when the agent produces a final answer or hits maxIterations.
     */
    async run(task, context = []) {
        const steps = [];
        let totalTokens = 0;
        // Build conversation history
        const messages = [
            ...context,
            { role: 'user', content: task }
        ];
        console.log(`\x1b[36m[REstJS Agent]\x1b[0m Starting task: "${task.slice(0, 60)}..."`);
        for (let iteration = 1; iteration <= this.options.maxIterations; iteration++) {
            const step = { iteration };
            // Ask the model what to do next
            const response = await this.provider.complete({
                messages,
                model: this.options.model,
                system: this.options.systemPrompt,
                temperature: this.options.temperature,
                tools: Array.from(this.tools.values()).map(t => t.definition),
                toolChoice: 'auto'
            });
            totalTokens += response.usage.totalTokens;
            // Log thinking
            if (response.content) {
                step.thought = response.content;
                console.log(`\x1b[90m[Agent Step ${iteration}]\x1b[0m Thought: ` +
                    `${response.content.slice(0, 100)}...`);
            }
            // Check if model wants to call tools
            if (response.toolCalls && response.toolCalls.length > 0) {
                step.toolCalls = response.toolCalls;
                step.toolResults = [];
                // Add assistant message with tool calls to history
                messages.push({
                    role: 'assistant',
                    content: response.content,
                    toolCalls: response.toolCalls
                });
                // Execute all tool calls (in parallel for efficiency)
                const toolResultMessages = [];
                await Promise.all(response.toolCalls.map(async (toolCall) => {
                    const tool = this.tools.get(toolCall.name);
                    console.log(`\x1b[33m[Agent Tool]\x1b[0m Calling: ${toolCall.name}` +
                        `(${JSON.stringify(toolCall.arguments).slice(0, 60)})`);
                    let result;
                    let error;
                    if (!tool) {
                        error = `Tool '${toolCall.name}' not found`;
                        result = { error };
                    }
                    else {
                        try {
                            result = await tool.handler(toolCall.arguments);
                            console.log(`\x1b[32m[Agent Tool]\x1b[0m ${toolCall.name} → ` +
                                `${JSON.stringify(result).slice(0, 80)}`);
                        }
                        catch (err) {
                            error = err.message;
                            result = { error };
                            console.error(`\x1b[31m[Agent Tool]\x1b[0m ${toolCall.name} failed: ${error}`);
                        }
                    }
                    step.toolResults.push({
                        toolCallId: toolCall.id,
                        toolName: toolCall.name,
                        result,
                        error
                    });
                    // Add tool result to message history
                    toolResultMessages.push({
                        role: 'tool',
                        content: JSON.stringify(result),
                        toolCallId: toolCall.id
                    });
                }));
                // Add all tool results to conversation
                messages.push(...toolResultMessages);
                // Notify step listener
                this.options.onStep?.(step);
                steps.push(step);
                // Continue loop to let model process tool results
                continue;
            }
            // No tool calls - model has a final answer
            if (response.finishReason === 'stop' || !response.toolCalls) {
                step.finalAnswer = response.content;
                steps.push(step);
                this.options.onStep?.(step);
                console.log(`\x1b[32m[REstJS Agent]\x1b[0m Completed in ${iteration} iteration(s)`);
                return {
                    response: response.content,
                    steps,
                    iterations: iteration,
                    success: true,
                    usage: { totalTokens, steps: steps.length }
                };
            }
            steps.push(step);
        }
        // Hit max iterations without finishing
        console.warn(`\x1b[33m[REstJS Agent]\x1b[0m Hit max iterations (${this.options.maxIterations})`);
        return {
            response: `Task could not be completed within ${this.options.maxIterations} iterations.`,
            steps,
            iterations: this.options.maxIterations,
            success: false,
            usage: { totalTokens, steps: steps.length }
        };
    }
    /**
     * Run the agent with streaming output.
     * Yields each step as it happens for real-time UIs.
     */
    async *runStream(task, context = []) {
        const steps = [];
        let totalTokens = 0;
        const messages = [
            ...context,
            { role: 'user', content: task }
        ];
        for (let iteration = 1; iteration <= this.options.maxIterations; iteration++) {
            const step = { iteration };
            const response = await this.provider.complete({
                messages,
                model: this.options.model,
                system: this.options.systemPrompt,
                temperature: this.options.temperature,
                tools: Array.from(this.tools.values()).map(t => t.definition),
                toolChoice: 'auto'
            });
            totalTokens += response.usage.totalTokens;
            if (response.content)
                step.thought = response.content;
            if (response.toolCalls && response.toolCalls.length > 0) {
                step.toolCalls = response.toolCalls;
                step.toolResults = [];
                messages.push({
                    role: 'assistant',
                    content: response.content,
                    toolCalls: response.toolCalls
                });
                // Yield the step before executing tools (shows "thinking" in UI)
                yield { ...step, done: false };
                const toolResultMessages = [];
                for (const toolCall of response.toolCalls) {
                    const tool = this.tools.get(toolCall.name);
                    let result;
                    try {
                        result = tool
                            ? await tool.handler(toolCall.arguments)
                            : { error: `Tool '${toolCall.name}' not found` };
                    }
                    catch (err) {
                        result = { error: err.message };
                    }
                    step.toolResults.push({
                        toolCallId: toolCall.id,
                        toolName: toolCall.name,
                        result
                    });
                    toolResultMessages.push({
                        role: 'tool',
                        content: JSON.stringify(result),
                        toolCallId: toolCall.id
                    });
                }
                messages.push(...toolResultMessages);
                steps.push(step);
                continue;
            }
            // Final answer
            step.finalAnswer = response.content;
            steps.push(step);
            yield {
                ...step,
                done: true,
                finalResult: {
                    response: response.content,
                    steps,
                    iterations: iteration,
                    success: true,
                    usage: { totalTokens, steps: steps.length }
                }
            };
            return;
        }
    }
}
exports.Agent = Agent;
//# sourceMappingURL=agent.js.map