/**
 * Tool system for AI agents.
 * Tools are functions that agents can call to interact with the world.
 *
 * Each tool has:
 *   - A name and description (the model reads these)
 *   - A JSON Schema for its parameters
 *   - An async handler function
 *
 * Usage:
 *   const searchTool = createTool({
 *     name: 'web_search',
 *     description: 'Search the web for current information',
 *     parameters: {
 *       type: 'object',
 *       properties: {
 *         query: { type: 'string', description: 'Search query' }
 *       },
 *       required: ['query']
 *     },
 *     handler: async ({ query }) => {
 *       const results = await searchWeb(query)
 *       return results
 *     }
 *   })
 */
import { ToolDefinition } from '../types';
export interface Tool {
    definition: ToolDefinition;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
}
export interface ToolConfig {
    name: string;
    description: string;
    parameters: ToolDefinition['parameters'];
    handler: (args: Record<string, unknown>) => Promise<unknown>;
}
/**
 * Create a tool from a config object.
 */
export declare function createTool(config: ToolConfig): Tool;
/**
 * Tool to get current date and time.
 */
export declare const currentDateTimeTool: Tool;
/**
 * Tool to perform math calculations.
 * Safer than eval - uses a @axiljsricted expression evaluator.
 */
export declare const calculatorTool: Tool;
/**
 * Tool to format and validate JSON.
 */
export declare const jsonTool: Tool;
//# sourceMappingURL=tool.d.ts.map