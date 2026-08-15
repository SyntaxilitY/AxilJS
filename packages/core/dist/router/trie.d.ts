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
import { RouteParams } from '@axil/common';
export interface TrieMatch<T> {
    handler: T;
    params: RouteParams;
}
export declare class Trie<T> {
    private root;
    constructor();
    /** Create an empty trie node */
    private createNode;
    /**
     * Register a route in the trie.
     *
     * @param method  HTTP method e.g. 'GET'
     * @param path    Route path e.g. '/users/:id'
     * @param handler Handler data to store at this route
     */
    insert(method: string, path: string, handler: T): void;
    /**
     * Find a matching route for the given method and path.
     *
     * @param method  HTTP method e.g. 'GET'
     * @param path    Request path e.g. '/users/123'
     * @returns Match result with handler and params, or null if no match
     */
    find(method: string, path: string): TrieMatch<T> | null;
    /**
     * Recursive depth-first search through the trie.
     */
    private search;
}
//# sourceMappingURL=trie.d.ts.map