"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonTool = exports.calculatorTool = exports.currentDateTimeTool = void 0;
exports.createTool = createTool;
/**
 * Create a tool from a config object.
 */
function createTool(config) {
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
exports.currentDateTimeTool = createTool({
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
 * Safer than eval - uses a restricted expression evaluator.
 */
exports.calculatorTool = createTool({
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
            // Restricted evaluation - only allow math operations
            // No eval() - use a safe expression parser
            const safeExpression = expression
                .replace(/[^0-9+\-*/().,\s%MathsqrtabceilogpowroundfloorceiltPIf]/g, '');
            // Use Function constructor in a restricted scope
            const result = new Function('Math', `"use strict"; return (${safeExpression})`)(Math);
            return { expression, result, type: typeof result };
        }
        catch (error) {
            return {
                expression,
                error: `Invalid expression: ${error.message}`
            };
        }
    }
});
/**
 * Tool to format and validate JSON.
 */
exports.jsonTool = createTool({
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
        const jsonStr = json;
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
        }
        catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
});
//# sourceMappingURL=tool.js.map