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
import { AIProvider, Message, ToolCall } from '../types';
import { Tool } from './tool';
export interface AgentOptions {
    provider: AIProvider;
    tools: Tool[];
    systemPrompt?: string;
    maxIterations?: number;
    model?: string;
    temperature?: number;
    onStep?: (step: AgentStep) => void;
}
export interface AgentStep {
    iteration: number;
    thought?: string;
    toolCalls?: ToolCall[];
    toolResults?: Array<{
        toolCallId: string;
        toolName: string;
        result: unknown;
        error?: string;
    }>;
    finalAnswer?: string;
}
export interface AgentResult {
    response: string;
    steps: AgentStep[];
    iterations: number;
    success: boolean;
    usage: {
        totalTokens: number;
        steps: number;
    };
}
export declare class Agent {
    private provider;
    private tools;
    private options;
    constructor(options: AgentOptions);
    /**
     * Run the agent on a task.
     * Returns when the agent produces a final answer or hits maxIterations.
     */
    run(task: string, context?: Message[]): Promise<AgentResult>;
    /**
     * Run the agent with streaming output.
     * Yields each step as it happens for real-time UIs.
     */
    runStream(task: string, context?: Message[]): AsyncGenerator<AgentStep & {
        done: boolean;
        finalResult?: AgentResult;
    }>;
}
//# sourceMappingURL=agent.d.ts.map