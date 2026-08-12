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
exports.Trie = void 0;
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
            handlers: new Map()
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
        for (const segment of segments) {
            if (segment.startsWith(':')) {
                // Dynamic segment: :id, :userId, etc.
                const paramName = segment.slice(1); // Remove the colon
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
        const params = {};
        const handler = this.search(this.root, segments, 0, method.toUpperCase(), params);
        if (!handler)
            return null;
        return { handler, params };
    }
    /**
     * Recursive depth-first search through the trie.
     */
    search(node, segments, index, method, params) {
        // We've consumed all segments - check for a handler at this node
        if (index === segments.length) {
            return node.handlers.get(method) || null;
        }
        const segment = segments[index];
        // 1. Try exact static match first (highest priority)
        if (node.children.has(segment)) {
            const result = this.search(node.children.get(segment), segments, index + 1, method, params);
            if (result)
                return result;
        }
        // 2. Try dynamic param match
        if (node.paramChild) {
            const savedParams = { ...params };
            // Capture this segment as the param value
            params[node.paramChild.paramName] = segment;
            const result = this.search(node.paramChild, segments, index + 1, method, params);
            if (result)
                return result;
            // Backtrack - restore params if this path didn't work
            Object.assign(params, savedParams);
            Object.keys(params).forEach(key => {
                if (!(key in savedParams))
                    delete params[key];
            });
        }
        // 3. Try wildcard match (lowest priority)
        if (node.wildcardChild) {
            // Wildcard consumes all remaining segments
            params['*'] = segments.slice(index).join('/');
            const result = node.wildcardChild.handlers.get(method) || null;
            if (result)
                return result;
        }
        return null;
    }
}
exports.Trie = Trie;
//# sourceMappingURL=trie.js.map