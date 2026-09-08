/**
 * HTTP semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tHttp ──────────────────────────────────────────────────────────────

export type THttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  | 'OPTIONS' | 'HEAD' | 'ALL'

export interface THttpOptions {
  method: THttpMethod
  path: string
  version?: string
  prefix?: string
}

export const tHttp = (options: THttpOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tHttp',
      description: 'Declares an HTTP-accessible endpoint',
      purpose: 'Marks a method as reachable via HTTP with specified method and path',
      why: 'A single semantic declaration replaces framework-specific method decorators',
      whenToUse: 'On any method that should be exposed via HTTP',
      whenNotToUse: 'On internal service methods or background jobs',
      category: 'HTTP',
      targets: ['method'],
      metadataProduced: ['http.method', 'http.path', 'http.version'],
      consumedBy: ['@axiljs/core', 'OpenAPI Generator', '@axiljs/studio'],
      composesWith: ['tAuth', 'tRateLimit', 'tCache', 'tValidate', 'tAudit'],
      examples: [
        '@tHttp({ method: "GET", path: "/users" })',
        '@tHttp({ method: "POST", path: "/users", version: "2" })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tHttp', target, propertyKey, options)
    }
  )

// ── tParam / tQuery / tBody / tHeader / tCookie / tFile ────────────────

const paramBinding = (
  name: string,
  category: string,
  description: string,
  examples: string[]
) => (key?: string): TDecoratorFunction =>
  defineDecorator(
    {
      name,
      description,
      purpose: `Binds an HTTP ${category.toLowerCase()} to a handler parameter`,
      why: 'Declarative parameter binding removes ad-hoc request parsing',
      whenToUse: `When a handler needs access to ${category.toLowerCase()} data`,
      category,
      targets: ['parameter'],
      consumedBy: ['@axiljs/core'],
      composesWith: ['tHttp'],
      examples
    },
    (target, propertyKey, descriptorOrIndex) => {
      const index = typeof descriptorOrIndex === 'number' ? descriptorOrIndex : 0
      registerMetadata(name, target, propertyKey, { key }, index)
    }
  )

export const tParam = paramBinding(
  'tParam', 'HTTP', 'Binds a URL path parameter to a handler argument',
  ['@tParam("id")', '@tParam()']
)

export const tQuery = paramBinding(
  'tQuery', 'HTTP', 'Binds a query string parameter to a handler argument',
  ['@tQuery("page")', '@tQuery()']
)

export const tBody = paramBinding(
  'tBody', 'HTTP', 'Binds the request body (or a body field) to a handler argument',
  ['@tBody()', '@tBody("email")']
)

export const tHeader = paramBinding(
  'tHeader', 'HTTP', 'Binds a request header to a handler argument',
  ['@tHeader("authorization")']
)

export const tCookie = paramBinding(
  'tCookie', 'HTTP', 'Binds a cookie to a handler argument',
  ['@tCookie("session")']
)

// ── tFile ──────────────────────────────────────────────────────────────

export interface TFileOptions {
  maxSize?: number
  mimeTypes?: string[]
  required?: boolean
  multiple?: boolean
}

export const tFile = (options: TFileOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tFile',
      description: 'Binds an uploaded file (or files) to a handler argument',
      purpose: 'Provides multipart file upload binding with size and MIME validation',
      why: 'File handling is a first-class HTTP semantic',
      whenToUse: 'On endpoints that accept file uploads',
      category: 'HTTP',
      targets: ['parameter'],
      consumedBy: ['@axiljs/core'],
      composesWith: ['tHttp', 'tSanitize'],
      examples: [
        '@tFile({ maxSize: 5_000_000, mimeTypes: ["image/*"] })',
        '@tFile({ multiple: true })'
      ]
    },
    (target, propertyKey, descriptorOrIndex) => {
      const index = typeof descriptorOrIndex === 'number' ? descriptorOrIndex : 0
      registerMetadata('tFile', target, propertyKey, options, index)
    }
  )

// ── tSse ───────────────────────────────────────────────────────────────

export const tSse = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tSse',
      description: 'Declares a Server-Sent Events stream endpoint',
      purpose: 'Marks a method as a long-lived SSE response stream',
      why: 'SSE is a distinct HTTP semantic that must be declared explicitly',
      whenToUse: 'On endpoints that push server events to the client',
      category: 'HTTP',
      targets: ['method'],
      consumedBy: ['@axiljs/core'],
      composesWith: ['tHttp', 'tAuth'],
      examples: ['@tSse()']
    },
    (target, propertyKey) => {
      registerMetadata('tSse', target, propertyKey, {})
    }
  )

// ── tRedirect ──────────────────────────────────────────────────────────

export interface TRedirectOptions {
  url: string
  status?: number
}

export const tRedirect = (options: TRedirectOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRedirect',
      description: 'Declares a redirect response for an endpoint',
      purpose: 'Marks the endpoint as returning a redirect status and Location header',
      why: 'Redirects are a semantic contract worth declaring at the route level',
      whenToUse: 'On endpoints that always redirect to another URL',
      category: 'HTTP',
      targets: ['method'],
      consumedBy: ['@axiljs/core'],
      composesWith: ['tHttp'],
      examples: [
        '@tRedirect({ url: "/new", status: 301 })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tRedirect', target, propertyKey, options)
    }
  )

// ── tStatus ────────────────────────────────────────────────────────────

export const tStatus = (code: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tStatus',
      description: 'Overrides the default HTTP status code',
      purpose: 'Sets a fixed HTTP status code on the response',
      why: 'Status semantics are separate from routing semantics',
      whenToUse: 'When an endpoint must always respond with a specific status',
      category: 'HTTP',
      targets: ['method'],
      consumedBy: ['@axiljs/core'],
      composesWith: ['tHttp'],
      examples: ['@tStatus(202)', '@tStatus(204)']
    },
    (target, propertyKey) => {
      registerMetadata('tStatus', target, propertyKey, { code })
    }
  )