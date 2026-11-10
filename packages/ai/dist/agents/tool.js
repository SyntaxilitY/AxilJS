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
exports.evaluateMathExpression = evaluateMathExpression;
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
// ─── Safe Arithmetic Evaluator ────────────────────────────────────────────────
// Functions and constants the calculator understands, with or without the
// `Math.` prefix. Null-prototype objects: no `constructor`, `__proto__`, ...
const MATH_FUNCTIONS = Object.assign(Object.create(null), {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
    ceil: Math.ceil, floor: Math.floor, round: Math.round, trunc: Math.trunc,
    log: Math.log, log2: Math.log2, log10: Math.log10, log1p: Math.log1p,
    exp: Math.exp, pow: Math.pow, min: Math.min, max: Math.max, hypot: Math.hypot,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh
});
const MATH_CONSTANTS = Object.assign(Object.create(null), {
    PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10,
    LOG2E: Math.LOG2E, LOG10E: Math.LOG10E, SQRT2: Math.SQRT2, SQRT1_2: Math.SQRT1_2
});
const MAX_EXPRESSION_LENGTH = 1000;
const MAX_NESTING_DEPTH = 100;
function tokenizeExpression(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
        if (num) {
            tokens.push({ type: 'num', value: parseFloat(num[0]) });
            i += num[0].length;
            continue;
        }
        const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
        if (ident) {
            tokens.push({ type: 'ident', value: ident[0] });
            i += ident[0].length;
            continue;
        }
        if (src.startsWith('**', i)) {
            tokens.push({ type: 'op', value: '^' });
            i += 2;
            continue;
        }
        if ('+-*/%^(),.'.includes(ch)) {
            tokens.push({ type: 'op', value: ch });
            i++;
            continue;
        }
        throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
    return tokens;
}
/**
 * Evaluate an arithmetic expression without eval / new Function.
 * Supports + - * / % ^ (and **), parentheses, unary +/-, decimals,
 * scientific notation, Math functions and constants (Math.sqrt or sqrt).
 * `^` binds tighter than unary minus and is right-associative: -2^2 = -4.
 */
function evaluateMathExpression(expression) {
    if (typeof expression !== 'string') {
        throw new Error('Expression must be a string');
    }
    if (expression.length > MAX_EXPRESSION_LENGTH) {
        throw new Error(`Expression longer than ${MAX_EXPRESSION_LENGTH} characters`);
    }
    const tokens = tokenizeExpression(expression);
    let pos = 0;
    let depth = 0;
    const peek = () => tokens[pos];
    const isOp = (value) => {
        const t = tokens[pos];
        return t !== undefined && t.type === 'op' && t.value === value;
    };
    const expectOp = (value) => {
        if (!isOp(value)) {
            const t = peek();
            throw new Error(`Expected '${value}' but found ${t ? `'${t.value}'` : 'end of expression'}`);
        }
        pos++;
    };
    const enter = () => {
        if (++depth > MAX_NESTING_DEPTH)
            throw new Error('Expression nested too deeply');
    };
    function parseAdditive() {
        enter();
        let value = parseMultiplicative();
        while (isOp('+') || isOp('-')) {
            const op = tokens[pos++].value;
            const rhs = parseMultiplicative();
            value = op === '+' ? value + rhs : value - rhs;
        }
        depth--;
        return value;
    }
    function parseMultiplicative() {
        let value = parseUnary();
        while (isOp('*') || isOp('/') || isOp('%')) {
            const op = tokens[pos++].value;
            const rhs = parseUnary();
            value = op === '*' ? value * rhs : op === '/' ? value / rhs : value % rhs;
        }
        return value;
    }
    function parseUnary() {
        if (isOp('-') || isOp('+')) {
            const op = tokens[pos++].value;
            enter();
            const value = parseUnary();
            depth--;
            return op === '-' ? -value : value;
        }
        return parsePower();
    }
    function parsePower() {
        const base = parsePrimary();
        if (isOp('^')) {
            pos++;
            enter();
            // Right-associative; exponent may carry its own sign (2^-1)
            const exponent = parseUnary();
            depth--;
            return Math.pow(base, exponent);
        }
        return base;
    }
    function parsePrimary() {
        const t = peek();
        if (!t)
            throw new Error('Unexpected end of expression');
        if (t.type === 'num') {
            pos++;
            return t.value;
        }
        if (t.type === 'op' && t.value === '(') {
            pos++;
            const value = parseAdditive();
            expectOp(')');
            return value;
        }
        if (t.type === 'ident') {
            pos++;
            let name = t.value;
            // Optional `Math.` namespace
            if (name === 'Math') {
                expectOp('.');
                const member = peek();
                if (!member || member.type !== 'ident')
                    throw new Error(`Expected a name after 'Math.'`);
                pos++;
                name = member.value;
            }
            if (isOp('(')) {
                const fn = MATH_FUNCTIONS[name];
                if (!fn)
                    throw new Error(`Unknown function '${name}'`);
                pos++;
                const args = [];
                if (!isOp(')')) {
                    args.push(parseAdditive());
                    while (isOp(',')) {
                        pos++;
                        args.push(parseAdditive());
                    }
                }
                expectOp(')');
                return fn(...args);
            }
            const constant = MATH_CONSTANTS[name];
            if (constant === undefined)
                throw new Error(`Unknown identifier '${name}'`);
            return constant;
        }
        throw new Error(`Unexpected '${t.value}'`);
    }
    if (tokens.length === 0)
        throw new Error('Empty expression');
    const result = parseAdditive();
    if (pos < tokens.length) {
        throw new Error(`Unexpected '${tokens[pos].value}' after end of expression`);
    }
    return result;
}
/**
 * Tool to perform math calculations.
 * Uses a small recursive-descent parser - no eval / new Function.
 */
exports.calculatorTool = createTool({
    name: 'calculator',
    description: 'Perform mathematical calculations. Supports +, -, *, /, ^ (or **), %, parentheses and Math functions/constants (sqrt, pow, log, sin, PI, E, ...)',
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
            const result = evaluateMathExpression(expression);
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