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
import * as ui from '../ui'

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

    // Machine-readable: pure JSON on stdout, no title or colour
    case 'graph':
      return emitGraph()

    case 'categories':
      return listCategories()

    default:
      ui.error(
        `Unknown decorator subcommand '${subcommand}'`,
        'Run `axil decorator` for the list of subcommands.'
      )
      process.exit(1)
  }
}

/** One row per decorator: "@tName   Category   description". */
function decoratorRows(decorators: TDecoratorInfo[]): string[][] {
  return decorators.map(d => [ui.cmd(`@${d.name}`), ui.muted(d.category), d.description])
}

// ============================================================================
// LIST
// ============================================================================

function listDecorators(args: string[]): void {
  const categoryFlag = args.find(a => a.startsWith('--category='))
  const category = categoryFlag?.split('=')[1]

  ui.title('decorator list', category ? `Category "${category}"` : 'All semantic decorators')

  const decorators = category
    ? DECORATOR_CATALOG.filter(d => d.category.toLowerCase() === category.toLowerCase())
    : DECORATOR_CATALOG

  const categories = Array.from(new Set(DECORATOR_CATALOG.map(d => d.category))).sort()

  if (decorators.length === 0) {
    ui.warn(`No decorators found${category ? ` in category "${category}"` : ''}.`)
    ui.line()
    ui.line(ui.muted(`Categories: ${categories.join(', ')}`))
    ui.line()
    return
  }

  const sorted = [...decorators].sort((a, b) => a.name.localeCompare(b.name))

  ui.line(ui.c.bold(`${sorted.length} decorator(s)${category ? ` in "${category}"` : ''}`))
  ui.line()
  ui.table(decoratorRows(sorted), { gap: 3 })

  ui.line()
  ui.line(ui.muted(`Categories: ${categories.join(', ')}`))
  ui.line(ui.muted(`Details: ${ui.cmd('axil decorator info <name>')}`))
  ui.line()
}

// ============================================================================
// INFO
// ============================================================================

function infoSection(heading: string, lines: string[], color: (t: string) => string = ui.c.bold): void {
  ui.line(color(heading))
  for (const l of lines) ui.line(`  ${l}`)
  ui.line()
}

function showDecoratorInfo(name: string | undefined): void {
  if (!name) {
    ui.error('Missing decorator name.', 'Usage: axil decorator info <name>')
    process.exit(1)
  }

  const info = findDecorator(name)

  if (!info) {
    ui.error(`Unknown decorator "${name}"`, 'Try `axil decorator search <keyword>`.')
    suggestSimilar(name)
    process.exit(1)
  }

  ui.title('decorator info', info.category)

  ui.line(`${ui.brand('@' + info.name)}  ${ui.muted('[' + info.category + ']')}`)
  ui.line(info.description)
  ui.line()

  infoSection('Purpose:', [info.purpose])
  infoSection('Why:', [info.why])
  infoSection('When to use:', [info.whenToUse])
  if (info.whenNotToUse) infoSection('When NOT to use:', [info.whenNotToUse])
  infoSection('Targets:', [info.targets.join(', ')])

  if (info.options) {
    ui.line(ui.c.bold('Options:'))
    ui.table(Object.entries(info.options).map(([key, desc]) => [ui.cmd(key), desc]), { indent: 4, gap: 2 })
    ui.line()
  }

  if (info.consumedBy?.length)    infoSection('Consumed by:', info.consumedBy)
  if (info.composesWith?.length)  infoSection('Compatible with:', info.composesWith.map(c => ui.c.green(c)))
  if (info.conflictsWith?.length) infoSection('Conflicts with:', info.conflictsWith.map(c => ui.c.red(c)), t => ui.c.bold(ui.c.red(t)))
  if (info.securityImpact)        infoSection('Security impact:', [info.securityImpact])
  if (info.performanceImpact)     infoSection('Performance impact:', [info.performanceImpact])

  infoSection('Examples:', info.examples.map(ex => ui.cmd(ex)))
}

function suggestSimilar(name: string): void {
  const lower = name.toLowerCase()
  const suggestions = DECORATOR_CATALOG
    .filter(d => d.name.toLowerCase().includes(lower.replace(/^t/, '')))
    .slice(0, 5)

  if (suggestions.length) {
    ui.line('Did you mean:')
    ui.list(suggestions.map(s => ui.cmd(`@${s.name}`)))
    ui.line()
  }
}

// ============================================================================
// SEARCH
// ============================================================================

function searchDecorators(query: string): void {
  if (!query) {
    ui.error('Missing search query.', 'Usage: axil decorator search <query>')
    process.exit(1)
  }

  ui.title('decorator search', `"${query}"`)

  const q = query.toLowerCase()

  const results = DECORATOR_CATALOG.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.description.toLowerCase().includes(q) ||
    d.purpose.toLowerCase().includes(q) ||
    d.category.toLowerCase().includes(q) ||
    d.why.toLowerCase().includes(q)
  )

  ui.line(ui.c.bold(`${results.length} result(s) for "${query}"`))
  ui.line()

  if (results.length === 0) {
    ui.warn('No matches. Try a broader term.')
    ui.line()
    return
  }

  ui.table(decoratorRows(results), { gap: 3 })
  ui.line()
}

// ============================================================================
// CATEGORIES
// ============================================================================

function listCategories(): void {
  const counts = new Map<string, number>()

  for (const d of DECORATOR_CATALOG) {
    counts.set(d.category, (counts.get(d.category) ?? 0) + 1)
  }

  ui.title('decorator categories', 'Decorator Categories')

  ui.table(
    Array.from(counts.entries()).sort().map(([category, count]) => [
      ui.c.bold(category),
      ui.muted(`${count} decorator(s)`)
    ]),
    { gap: 3 }
  )

  ui.line()
  ui.line(ui.muted(`Total: ${DECORATOR_CATALOG.length} decorators`))
  ui.line()
}

// ============================================================================
// CHECK — composition validation against a source file
// ============================================================================

function checkFile(filePath: string | undefined): void {
  if (!filePath) {
    ui.error('Missing file path.', 'Usage: axil decorator check <file>')
    process.exit(1)
  }

  const fullPath = resolve(process.cwd(), filePath)

  if (!existsSync(fullPath)) {
    ui.error(`File not found: ${fullPath}`, 'Usage: axil decorator check <file>')
    process.exit(1)
  }

  const source = readFileSync(fullPath, 'utf-8')

  ui.title('decorator check', `Checking ${ui.path(filePath)}`)

  const methodBlocks = extractDecoratedMethods(source)

  if (methodBlocks.length === 0) {
    ui.info('No decorated methods found.')
    ui.line()
    return
  }

  let conflicts = 0

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
      conflicts++
      ui.line(`${ui.c.red(ui.sym.cross)} ${ui.c.bold(block.methodName)} ${ui.c.red('— CONFLICT')}`)
      for (const err of errors) ui.line(`    ${err}`)
      ui.line(`    ${ui.muted('Location:')} ${ui.path(`${filePath}:${block.line}`)}`)
    } else {
      ui.success(block.methodName, `— ${usedNames.length} decorator(s), valid composition`)
    }
  }

  if (conflicts > 0) {
    ui.failed(`${conflicts} of ${methodBlocks.length} method(s) have conflicting decorators`)
    process.exit(1)
  }

  ui.done(`${methodBlocks.length} method(s) checked, no conflicts`)
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