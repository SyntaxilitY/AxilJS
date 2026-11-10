/**
 * axil decorator — CLI command for inspecting AxilJS semantic decorators.
 *
 * Subcommands:
 *   list [--category=<cat>]   List all registered decorators
 *   info <name>               Show full TDecoratorInfo documentation
 *   search <query>            Free-text search across all decorators
 *   check <file>              Validate decorator composition in a file
 *   graph                     Emit metadata dependency graph
 *   categories                List all decorator categories
 *
 * The decorator catalog lives in `./decorator-catalog.ts` and mirrors
 * the TDecoratorInfo contracts shipped by @axiljs/decorator. It is
 * bundled directly in the CLI so introspection works even when
 * @axiljs/decorator is not installed in the current project.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { DECORATOR_CATALOG, type TDecoratorInfo } from './decorator-catalog'

// ============================================================================
// ENTRY POINT
// ============================================================================

export async function runDecorator(
  subcommand: string,
  args: string[]
): Promise<void> {
  switch (subcommand) {
    case 'list':
      return listDecorators(args)

    case 'info':
      return showDecoratorInfo(args[0])

    case 'search':
      return searchDecorators(args.join(' '))

    case 'check':
      return checkFile(args[0])

    case 'graph':
      return emitGraph()

    case 'categories':
      return listCategories()

    default:
      console.error(
        `\x1b[31mError:\x1b[0m Unknown decorator subcommand '${subcommand}'`
      )
      console.error(
        'Run \x1b[1maxil decorator --help\x1b[0m style: just run \x1b[1maxil decorator\x1b[0m for usage.'
      )
      process.exit(1)
  }
}

// ============================================================================
// LIST
// ============================================================================

function listDecorators(args: string[]): void {
  const categoryFlag = args.find(a => a.startsWith('--category='))
  const category = categoryFlag?.split('=')[1]

  const decorators = category
    ? DECORATOR_CATALOG.filter(d => d.category.toLowerCase() === category.toLowerCase())
    : DECORATOR_CATALOG

  if (decorators.length === 0) {
    console.log(`\nNo decorators found${category ? ` in category "${category}"` : ''}.\n`)
    return
  }

  const sorted = [...decorators].sort((a, b) => a.name.localeCompare(b.name))

  console.log(
    `\n\x1b[1m${sorted.length} decorator(s)${category ? ` in "${category}"` : ''}\x1b[0m\n`
  )

  for (const d of sorted) {
    const tag = `[${d.category}]`.padEnd(16)
    console.log(`  \x1b[36m@${d.name.padEnd(22)}\x1b[0m ${tag} ${d.description}`)
  }

  const categories = Array.from(new Set(DECORATOR_CATALOG.map(d => d.category))).sort()
  console.log(`\n\x1b[2mCategories: ${categories.join(', ')}\x1b[0m\n`)
}

// ============================================================================
// INFO
// ============================================================================

function showDecoratorInfo(name: string | undefined): void {
  if (!name) {
    console.error('\x1b[31mError:\x1b[0m Usage: axil decorator info <name>')
    process.exit(1)
  }

  const info = findDecorator(name)

  if (!info) {
    console.error(`\x1b[31mError:\x1b[0m Unknown decorator "${name}"`)
    suggestSimilar(name)
    process.exit(1)
  }

  console.log(`\n\x1b[1m\x1b[36m${info.name}\x1b[0m  \x1b[2m[${info.category}]\x1b[0m\n`)
  console.log(`${info.description}\n`)

  console.log('\x1b[1mPurpose:\x1b[0m')
  console.log(`  ${info.purpose}\n`)

  console.log('\x1b[1mWhy:\x1b[0m')
  console.log(`  ${info.why}\n`)

  console.log('\x1b[1mWhen to use:\x1b[0m')
  console.log(`  ${info.whenToUse}\n`)

  if (info.whenNotToUse) {
    console.log('\x1b[1mWhen NOT to use:\x1b[0m')
    console.log(`  ${info.whenNotToUse}\n`)
  }

  console.log('\x1b[1mTargets:\x1b[0m')
  console.log(`  ${info.targets.join(', ')}\n`)

  if (info.options) {
    console.log('\x1b[1mOptions:\x1b[0m')
    for (const [key, desc] of Object.entries(info.options)) {
      console.log(`  ${key.padEnd(16)} ${desc}`)
    }
    console.log()
  }

  if (info.consumedBy?.length) {
    console.log('\x1b[1mConsumed by:\x1b[0m')
    info.consumedBy.forEach(c => console.log(`  ${c}`))
    console.log()
  }

  if (info.composesWith?.length) {
    console.log('\x1b[1mCompatible with:\x1b[0m')
    info.composesWith.forEach(c => console.log(`  ${c}`))
    console.log()
  }

  if (info.conflictsWith?.length) {
    console.log('\x1b[1m\x1b[31mConflicts with:\x1b[0m')
    info.conflictsWith.forEach(c => console.log(`  ${c}`))
    console.log()
  }

  if (info.securityImpact) {
    console.log('\x1b[1mSecurity impact:\x1b[0m')
    console.log(`  ${info.securityImpact}\n`)
  }

  if (info.performanceImpact) {
    console.log('\x1b[1mPerformance impact:\x1b[0m')
    console.log(`  ${info.performanceImpact}\n`)
  }

  console.log('\x1b[1mExamples:\x1b[0m')
  info.examples.forEach(ex => console.log(`  ${ex}`))
  console.log()
}

function suggestSimilar(name: string): void {
  const lower = name.toLowerCase()
  const suggestions = DECORATOR_CATALOG
    .filter(d => d.name.toLowerCase().includes(lower.replace(/^t/, '')))
    .slice(0, 5)

  if (suggestions.length) {
    console.log('\nDid you mean:')
    suggestions.forEach(s => console.log(`  @${s.name}`))
    console.log()
  }
}

// ============================================================================
// SEARCH
// ============================================================================

function searchDecorators(query: string): void {
  if (!query) {
    console.error('\x1b[31mError:\x1b[0m Usage: axil decorator search <query>')
    process.exit(1)
  }

  const q = query.toLowerCase()

  const results = DECORATOR_CATALOG.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.description.toLowerCase().includes(q) ||
    d.purpose.toLowerCase().includes(q) ||
    d.category.toLowerCase().includes(q) ||
    d.why.toLowerCase().includes(q)
  )

  console.log(`\n\x1b[1m${results.length} result(s) for "${query}"\x1b[0m\n`)

  if (results.length === 0) {
    console.log('  No matches. Try a broader term.\n')
    return
  }

  for (const d of results) {
    console.log(`  \x1b[36m@${d.name.padEnd(22)}\x1b[0m [${d.category}]  ${d.description}`)
  }
  console.log()
}

// ============================================================================
// CATEGORIES
// ============================================================================

function listCategories(): void {
  const counts = new Map<string, number>()

  for (const d of DECORATOR_CATALOG) {
    counts.set(d.category, (counts.get(d.category) ?? 0) + 1)
  }

  console.log('\n\x1b[1mDecorator Categories\x1b[0m\n')

  for (const [category, count] of Array.from(counts.entries()).sort()) {
    console.log(`  ${category.padEnd(20)} ${count} decorator(s)`)
  }

  console.log(`\n  \x1b[2mTotal: ${DECORATOR_CATALOG.length} decorators\x1b[0m\n`)
}

// ============================================================================
// CHECK — composition validation against a source file
// ============================================================================

function checkFile(filePath: string | undefined): void {
  if (!filePath) {
    console.error('\x1b[31mError:\x1b[0m Usage: axil decorator check <file>')
    process.exit(1)
  }

  const fullPath = resolve(process.cwd(), filePath)

  if (!existsSync(fullPath)) {
    console.error(`\x1b[31mError:\x1b[0m File not found: ${fullPath}`)
    process.exit(1)
  }

  const source = readFileSync(fullPath, 'utf-8')

  console.log(`\nChecking ${filePath}...\n`)

  const methodBlocks = extractDecoratedMethods(source)

  if (methodBlocks.length === 0) {
    console.log('  No decorated methods found.\n')
    return
  }

  let hasErrors = false

  for (const block of methodBlocks) {
    const usedNames = block.decorators.map(d => d.name)
    const errors: string[] = []

    for (const decoratorName of usedNames) {
      const info = findDecorator(decoratorName)
      if (!info?.conflictsWith) continue

      for (const conflict of info.conflictsWith) {
        const conflictName = conflict.split(' ')[0].replace('@', '')
        if (usedNames.includes(conflictName) && conflictName !== decoratorName) {
          errors.push(
            `@${decoratorName} conflicts with @${conflictName} — ${conflict}`
          )
        }
      }
    }

    if (errors.length > 0) {
      hasErrors = true
      console.log(`  \x1b[31m✗\x1b[0m ${block.methodName} — CONFLICT\n`)
      for (const err of errors) {
        console.log(`      ${err}`)
      }
      console.log(`      Location: ${filePath}:${block.line}\n`)
    } else {
      console.log(`  \x1b[32m✓\x1b[0m ${block.methodName}  — ${usedNames.length} decorator(s), valid composition`)
    }
  }

  console.log()

  if (hasErrors) {
    process.exit(1)
  }
}

interface DecoratedMethodBlock {
  methodName: string
  decorators: Array<{ name: string }>
  line: number
}

/**
 * Lightweight regex-based extraction of decorator stacks above method
 * declarations. This is intentionally not a full TypeScript AST parse —
 * it is good enough for CLI-level composition linting.
 */
function extractDecoratedMethods(source: string): DecoratedMethodBlock[] {
  const lines = source.split('\n')
  const blocks: DecoratedMethodBlock[] = []

  let pendingDecorators: Array<{ name: string }> = []
  let pendingStartLine = 0
  // Open-paren depth of a decorator call spanning several lines, e.g.
  //   @tHttp({
  //     method: 'GET'
  //   })
  let decoratorDepth = 0

  const parenDelta = (text: string): number =>
    (text.match(/\(/g)?.length ?? 0) - (text.match(/\)/g)?.length ?? 0)

  const decoratorRegex = /^\s*@(t[A-Z][a-zA-Z0-9]*)\s*\(/
  const methodRegex = /^\s*(?:public\s+|private\s+|protected\s+|async\s+|static\s+)*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (decoratorDepth > 0) {
      decoratorDepth = Math.max(0, decoratorDepth + parenDelta(line))
      continue
    }

    const decoratorMatch = line.match(decoratorRegex)

    if (decoratorMatch) {
      if (pendingDecorators.length === 0) pendingStartLine = i + 1
      pendingDecorators.push({ name: decoratorMatch[1] })
      decoratorDepth = Math.max(0, parenDelta(line))
      continue
    }

    if (pendingDecorators.length > 0) {
      const methodMatch = line.match(methodRegex)
      if (methodMatch) {
        blocks.push({
          methodName: methodMatch[1],
          decorators: pendingDecorators,
          line: pendingStartLine
        })
      }
      pendingDecorators = []
    }
  }

  return blocks
}

// ============================================================================
// GRAPH
// ============================================================================

function emitGraph(): void {
  const graph = DECORATOR_CATALOG.map(d => ({
    name: d.name,
    category: d.category,
    consumedBy: d.consumedBy ?? [],
    composesWith: d.composesWith ?? [],
    conflictsWith: d.conflictsWith ?? []
  }))

  console.log(JSON.stringify({ decorators: graph }, null, 2))
}

// ============================================================================
// HELPERS
// ============================================================================

function findDecorator(name: string): TDecoratorInfo | undefined {
  const normalized = name.startsWith('t') ? name : `t${name[0].toUpperCase()}${name.slice(1)}`
  return DECORATOR_CATALOG.find(
    d => d.name.toLowerCase() === name.toLowerCase() ||
         d.name.toLowerCase() === normalized.toLowerCase()
  )
}