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

import { RouteParams } from '@axiljs/common';

// ─── Trie Node ────────────────────────────────────────────────────────────────

interface TrieNode<T> {
  // Static children: exact segment matches
  // Key = path segment, Value = child node
  children: Map<string, TrieNode<T>>;

  // Dynamic child: matches :param segments
  paramChild?: TrieNode<T>;

  // The param name for paramChild e.g. "id" from ":id"
  paramName?: string;

  // Wildcard child: matches * (everything remaining)
  wildcardChild?: TrieNode<T>;

  // Route handlers stored at this node (one per HTTP method)
  // Key = HTTP method, Value = handler data
  handlers: Map<string, T>;

  // Ordered param names of the route registered at this node, per method.
  // Stored per route because routes sharing a param position may use
  // different names (/users/:id vs /users/:userId/posts).
  paramKeys: Map<string, string[]>;
}

/** Decode a path segment; keep it raw if it is malformed. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Method key used for routes registered with all() */
export const ALL_METHODS = '*';

// ─── Match Result ─────────────────────────────────────────────────────────────

export interface TrieMatch<T> {
  // The matched handler data
  handler: T;

  // Extracted route params e.g. { id: '123' }
  params: RouteParams;
}

// ─── Trie ─────────────────────────────────────────────────────────────────────

export class Trie<T> {
  private root: TrieNode<T>;

  constructor() {
    this.root = this.createNode();
  }

  /** Create an empty trie node */
  private createNode(): TrieNode<T> {
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
  insert(method: string, path: string, handler: T): void {
    let node = this.root;

    // Split path into segments, filter empty strings
    // '/users/:id' → ['users', ':id']
    const segments = path.split('/').filter(Boolean);
    const paramNames: string[] = [];

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
      } else if (segment === '*') {
        // Wildcard segment: matches everything remaining
        if (!node.wildcardChild) {
          node.wildcardChild = this.createNode();
        }

        node = node.wildcardChild;
      } else {
        // Static segment: exact match required
        if (!node.children.has(segment)) {
          node.children.set(segment, this.createNode());
        }

        node = node.children.get(segment)!;
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
  find(method: string, path: string): TrieMatch<T> | null {
    const segments = path.split('/').filter(Boolean);
    const values: string[] = [];

    const found = this.search(
      this.root,
      segments,
      0,
      method.toUpperCase(),
      values
    );

    if (!found) return null;

    // Map captured values to the param names of the matched route
    const params: RouteParams = {};
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
  private methodKey(node: TrieNode<T>, method: string): string | null {
    if (node.handlers.has(method)) return method;
    if (node.handlers.has(ALL_METHODS)) return ALL_METHODS;
    return null;
  }

  /**
   * Recursive depth-first search through the trie.
   * Captured :param values are pushed onto `values` (popped on backtrack).
   */
  private search(
    node: TrieNode<T>,
    segments: string[],
    index: number,
    method: string,
    values: string[]
  ): { handler: T; node: TrieNode<T>; key: string; wildcard?: string } | null {
    // We've consumed all segments - check for a handler at this node
    if (index === segments.length) {
      const key = this.methodKey(node, method);
      return key ? { handler: node.handlers.get(key)!, node, key } : null;
    }

    const segment = segments[index];

    // 1. Try exact static match first (highest priority)
    if (node.children.has(segment)) {
      const result = this.search(
        node.children.get(segment)!,
        segments,
        index + 1,
        method,
        values
      );
      if (result) return result;
    }

    // 2. Try dynamic param match
    if (node.paramChild) {
      // Capture this segment as the param value
      values.push(segment);

      const result = this.search(
        node.paramChild,
        segments,
        index + 1,
        method,
        values
      );

      if (result) return result;

      // Backtrack - drop the value captured for this path
      values.pop();
    }

    // 3. Try wildcard match (lowest priority)
    if (node.wildcardChild) {
      // Wildcard consumes all remaining segments
      const key = this.methodKey(node.wildcardChild, method);
      if (key) {
        return {
          handler: node.wildcardChild.handlers.get(key)!,
          node: node.wildcardChild,
          key,
          wildcard: segments.slice(index).join('/')
        };
      }
    }

    return null;
  }
}