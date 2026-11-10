"use strict";
/**
 * Trie-based route matcher.
 * Uses a trie (prefix tree) for O(log n) route matching.
 * Much faster than linear array search for large route sets.
 *
 * Supports:
 *   Static segments:  /users/profile
 *   Dynamic params:   /users/:id
 *   Wildcard:         /files/*
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trie = exports.ALL_METHODS = void 0;
/** Decode a path segment; keep it raw if it is malformed. */
function decodeSegment(segment) {
    try {
        return decodeURIComponent(segment);
    }
    catch {
        return segment;
    }
}
/** Method key used for routes registered with all() */
exports.ALL_METHODS = '*';
// ─── Trie ─────────────────────────────────────────────────────────────────────
class Trie {
    root;
    constructor() {
        this.root = this.createNode();
    }
    /** Create an empty trie node */
    createNode() {
        return {
            children: new Map(),
            handlers: new Map(),
            paramKeys: new Map()
        };
    }
    /**
     * Register a route in the trie.
     *
     * @param method  HTTP method e.g. 'GET'
     * @param path    Route path e.g. '/users/:id'
     * @param handler Handler data to store at this route
     */
    insert(method, path, handler) {
        let node = this.root;
        // Split path into segments, filter empty strings
        // '/users/:id' → ['users', ':id']
        const segments = path.split('/').filter(Boolean);
        const paramNames = [];
        for (const segment of segments) {
            if (segment.startsWith(':')) {
                // Dynamic segment: :id, :userId, etc.
                const paramName = segment.slice(1); // Remove the colon
                paramNames.push(paramName);
                if (!node.paramChild) {
                    node.paramChild = this.createNode();
                }
                node.paramChild.paramName = paramName;
                node = node.paramChild;
            }
            else if (segment === '*') {
                // Wildcard segment: matches everything remaining
                if (!node.wildcardChild) {
                    node.wildcardChild = this.createNode();
                }
                node = node.wildcardChild;
            }
            else {
                // Static segment: exact match required
                if (!node.children.has(segment)) {
                    node.children.set(segment, this.createNode());
                }
                node = node.children.get(segment);
            }
        }
        // Store handler at the final node
        node.handlers.set(method.toUpperCase(), handler);
        node.paramKeys.set(method.toUpperCase(), paramNames);
    }
    /**
     * Find a matching route for the given method and path.
     *
     * @param method  HTTP method e.g. 'GET'
     * @param path    Request path e.g. '/users/123'
     * @returns Match result with handler and params, or null if no match
     */
    find(method, path) {
        const segments = path.split('/').filter(Boolean);
        const values = [];
        const found = this.search(this.root, segments, 0, method.toUpperCase(), values);
        if (!found)
            return null;
        // Map captured values to the param names of the matched route
        const params = {};
        const names = found.node.paramKeys.get(found.key) || [];
        names.forEach((name, i) => {
            params[name] = decodeSegment(values[i]);
        });
        if (found.wildcard !== undefined) {
            params['*'] = found.wildcard;
        }
        return { handler: found.handler, params };
    }
    /**
     * The handler key to use at a node: the exact method, else an all() route.
     */
    methodKey(node, method) {
        if (node.handlers.has(method))
            return method;
        if (node.handlers.has(exports.ALL_METHODS))
            return exports.ALL_METHODS;
        return null;
    }
    /**
     * Recursive depth-first search through the trie.
     * Captured :param values are pushed onto `values` (popped on backtrack).
     */
    search(node, segments, index, method, values) {
        // We've consumed all segments - check for a handler at this node
        if (index === segments.length) {
            const key = this.methodKey(node, method);
            return key ? { handler: node.handlers.get(key), node, key } : null;
        }
        const segment = segments[index];
        // 1. Try exact static match first (highest priority)
        if (node.children.has(segment)) {
            const result = this.search(node.children.get(segment), segments, index + 1, method, values);
            if (result)
                return result;
        }
        // 2. Try dynamic param match
        if (node.paramChild) {
            // Capture this segment as the param value
            values.push(segment);
            const result = this.search(node.paramChild, segments, index + 1, method, values);
            if (result)
                return result;
            // Backtrack - drop the value captured for this path
            values.pop();
        }
        // 3. Try wildcard match (lowest priority)
        if (node.wildcardChild) {
            // Wildcard consumes all remaining segments
            const key = this.methodKey(node.wildcardChild, method);
            if (key) {
                return {
                    handler: node.wildcardChild.handlers.get(key),
                    node: node.wildcardChild,
                    key,
                    wildcard: segments.slice(index).join('/')
                };
            }
        }
        return null;
    }
}
exports.Trie = Trie;
//# sourceMappingURL=trie.js.map