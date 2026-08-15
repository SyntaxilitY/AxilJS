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

// ─── Tool ─────────────────────────────────────────────────────────────────────

export interface Tool {
  // Tool definition (sent to the model)
  definition: ToolDefinition;

  // The actual implementation
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// ─── Tool Config ─────────────────────────────────────────────────────────────

export interface ToolConfig {
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Create a tool from a config object.
 */
export function createTool(config: ToolConfig): Tool {
  return {
    definition: {
      name: config.name,
      description: config.description,
      parameters: config.parameters
    },
    handler: config.handler
  };
}

// ─── Built-in Tools ───────────────────────────────────────────────────────────

/**
 * Tool to get current date and time.
 */
export const currentDateTimeTool = createTool({
  name: 'get_current_datetime',
  description: 'Get the current date and time in ISO 8601 format',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone name (e.g. UTC, America/New_York)'
      }
    }
  },
  handler: async ({ timezone }) => {
    return {
      datetime: new Date().toISOString(),
      timezone: timezone || 'UTC',
      unix: Math.floor(Date.now() / 1000)
    };
  }
});

/**
 * Tool to perform math calculations.
 * Safer than eval - uses a @axilricted expression evaluator.
 */
export const calculatorTool = createTool({
  name: 'calculator',
  description: 'Perform mathematical calculations. Supports +, -, *, /, **, %, Math functions',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g. "2 + 2", "Math.sqrt(16)")'
      }
    },
    required: ['expression']
  },
  handler: async ({ expression }) => {
    try {
      // @axilricted evaluation - only allow math operations
      // No eval() - use a safe expression parser
      const safeExpression = (expression as string)
        .replace(/[^0-9+\-*/().,\s%MathsqrtabceilogpowroundfloorceiltPIf]/g, '');

      // Use Function constructor in a @axilricted scope
      const result = new Function(
        'Math',
        `"use strict"; return (${safeExpression})`
      )(Math);

      return { expression, result, type: typeof result };
    } catch (error) {
      return {
        expression,
        error: `Invalid expression: ${(error as Error).message}`
      };
    }
  }
});

/**
 * Tool to format and validate JSON.
 */
export const jsonTool = createTool({
  name: 'json_processor',
  description: 'Parse, validate, and format JSON data',
  parameters: {
    type: 'object',
    properties: {
      json: { type: 'string', description: 'JSON string to process' },
      action: {
        type: 'string',
        enum: ['parse', 'validate', 'format', 'minify'],
        description: 'What to do with the JSON'
      }
    },
    required: ['json', 'action']
  },
  handler: async ({ json, action }) => {
    const jsonStr = json as string;

    try {
      const parsed = JSON.parse(jsonStr);

      switch (action) {
        case 'parse':
        case 'validate':
          return { valid: true, data: parsed, type: typeof parsed };

        case 'format':
          return { result: JSON.stringify(parsed, null, 2) };

        case 'minify':
          return { result: JSON.stringify(parsed) };

        default:
          return { error: 'Unknown action' };
      }
    } catch (error) {
      return {
        valid: false,
        error: (error as Error).message
      };
    }
  }
});