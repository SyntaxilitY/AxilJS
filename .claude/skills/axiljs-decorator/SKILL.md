---
name: axiljs-decorator
description: Add or change a semantic decorator in @axiljs/decorator (the t-prefixed decorators like tHttp, tRetry, tSaga) and keep the CLI's bundled catalog in sync. Use whenever packages/decorator/src or packages/cli/src/commands/decorator-catalog.ts is touched, or when asked for a new decorator.
---

# Adding / changing an AxilJS decorator

AxilJS decorators describe **backend semantics, not framework architecture**. Read `packages/decorator/+REQUIREMENT.md` before inventing anything new; it lists what belongs and what is banned:

- Prefix every decorator with `t` (`tCache`, not `Cache`).
- Never add HTTP-verb decorators (`@Get`, `@Post`); use `tHttp({ method, path })`.
- Never add NestJS-style architecture decorators (`@Injectable`, `@Controller`, `@Module`, `@UseGuards`, ...).

## Two sources of truth (keep them in sync)

| Where | What |
|---|---|
| `packages/decorator/src/decorators/<group>.ts` | Implementation: `defineDecorator(info, handler)` |
| `packages/cli/src/commands/decorator-catalog.ts` | Copy of every `TDecoratorInfo`, bundled so `axil decorator list/info/search` work without the decorator package |

The decorator package was once unbuildable because `index.ts` re-exported a group file (`distributed.ts`) that only existed in the CLI catalog. Always run the drift check:

```bash
bash .claude/skills/axiljs-decorator/check-catalog.sh
```

## Steps

1. Pick the group file by `category` (`http`, `security`, `data`, `reliability`, `concurrency`, `distributed`, `messaging`, `caching`, `observability`, `compliance`, `runtime`, `workflow`, `ai`, `contract`, `execution`, `validation`). Create a new group file only for a genuinely new category, and add `export * from './decorators/<file>'` to `src/index.ts`.
2. Copy the shape of a neighbour in the same file:

```ts
// ── tExample ───────────────────────────────────────────────────────────

export interface TExampleOptions {
  ttl?: number
}

export const tExample = (options: TExampleOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tExample',              // must equal the export name
      description: '...',            // all of these are REQUIRED; info-store throws if missing
      purpose: '...',
      why: '...',
      whenToUse: '...',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit'],
      composesWith: ['tRetry'],
      examples: ['@tExample({ ttl: 1000 })']
    },
    (target, propertyKey) => {
      registerMetadata('tExample', target, propertyKey, options)
    }
  )
```

   Class-only decorators pass `undefined` as `propertyKey`. Parameter decorators receive the index as the third handler arg (see `paramBinding` in `http.ts`).
   No semicolons, 2-space indent, single quotes: match the file.
3. Add the identical `TDecoratorInfo` object to the matching `*_DECORATORS` array in `decorator-catalog.ts`.
4. If you mention it in `packages/decorator/README.md` tables, keep the name exact.
5. Verify:

```bash
bash .claude/skills/axiljs-decorator/check-catalog.sh
bash .claude/skills/axiljs-verify/verify.sh decorator cli
```

## Known behaviour to respect

- Decorators only **record metadata** in `core/registry.ts`; consumers (`@axiljs/core`, `@axiljs/circuit`, ...) read it with `getMetadata` / `getAllMetadata`. A decorator must not wrap or change the method unless its contract says so.
- `TDecoratorInfo` is registered when the decorator factory is *called*. Introspection (`listDecorators`, `getDecoratorInfo`, `searchDecorators`, `listCategories`) primes the store by calling every `t*` export of the group modules listed in `__setCatalogLoader` at the bottom of `src/index.ts`. A **new group file must be added to that list**. Factories must therefore be side-effect free until the returned decorator is applied.
- Tests: `packages/decorator/tests/decorator.test.ts` (vitest). Add cases for new decorators there.
- Metadata stores are per-class. A subclass starts with a copy of its parent's metadata and must never write into the parent's store (`getStore` in `registry.ts`).
- Runtime tests of decorators with `tsx` need `"experimentalDecorators": true` in a nearby tsconfig.json.
