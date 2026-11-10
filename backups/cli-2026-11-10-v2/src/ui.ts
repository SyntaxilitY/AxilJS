/**
 * AxilJS CLI — terminal UI kit.
 *
 * One place for every colour, symbol and layout primitive the CLI prints,
 * so all commands share the same look. Dependency-free.
 *
 *   - Colours honour NO_COLOR, FORCE_COLOR, TERM=dumb and non-TTY output
 *   - Unicode symbols fall back to ASCII on legacy Windows consoles
 *   - Layout helpers measure visible width (ANSI codes stripped)
 */

// ============================================================================
// CAPABILITIES
// ============================================================================

function detectColor(): boolean {
  const env = process.env
  if ('NO_COLOR' in env && env.NO_COLOR !== '') return false
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false'
  if (env.TERM === 'dumb') return false
  return Boolean(process.stdout && process.stdout.isTTY)
}

function detectUnicode(): boolean {
  const env = process.env
  if (process.platform !== 'win32') return env.TERM !== 'linux'
  return Boolean(
    env.WT_SESSION ||                         // Windows Terminal
    env.TERMINUS_SUBLIME ||
    env.ConEmuTask === '{cmd::Cmder}' ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERM === 'xterm-256color' ||
    env.TERM === 'alacritty' ||
    env.TERMINAL_EMULATOR === 'JetBrains-JediTerm'
  )
}

export const supportsColor   = detectColor()
export const supportsUnicode = detectUnicode()

// ============================================================================
// COLOURS
// ============================================================================

type Paint = (text: string | number) => string

function code(open: number, close: number): Paint {
  return text => supportsColor ? `\x1b[${open}m${text}\x1b[${close}m` : String(text)
}

export const c = {
  bold:      code(1, 22),
  dim:       code(2, 22),
  italic:    code(3, 23),
  underline: code(4, 24),
  red:       code(31, 39),
  green:     code(32, 39),
  yellow:    code(33, 39),
  blue:      code(34, 39),
  magenta:   code(35, 39),
  cyan:      code(36, 39),
  gray:      code(90, 39)
}

/** Brand colour (AxilJS cyan) — titles, commands, highlights. */
export const brand: Paint = text => c.bold(c.cyan(text))
/** A command or code fragment the user can type. */
export const cmd: Paint = text => c.cyan(text)
/** A file system path. */
export const path: Paint = text => c.underline(String(text))
/** De-emphasised supporting text. */
export const muted: Paint = text => c.gray(text)

// ============================================================================
// SYMBOLS
// ============================================================================

export const sym = supportsUnicode
  ? {
      logo: '◆', tick: '✔', cross: '✖', warn: '▲', info: 'ℹ', arrow: '›',
      pointer: '❯', bullet: '•', dot: '·', line: '─',
      tl: '╭', tr: '╮', bl: '╰', br: '╯', v: '│'
    }
  : {
      logo: '*', tick: '√', cross: 'x', warn: '!', info: 'i', arrow: '>',
      pointer: '>', bullet: '*', dot: '-', line: '-',
      tl: '+', tr: '+', bl: '+', br: '+', v: '|'
    }

const SPINNER_FRAMES = supportsUnicode
  ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  : ['-', '\\', '|', '/']

// ============================================================================
// MEASURE
// ============================================================================

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export function width(text: string): number {
  return stripAnsi(text).length
}

export function pad(text: string, size: number): string {
  return text + ' '.repeat(Math.max(0, size - width(text)))
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

// ============================================================================
// OUTPUT
// ============================================================================

// Helpers pad themselves with blank lines; never print two in a row.
// One flag for both streams: they interleave on the same terminal.
let lastBlank = false

const out = (line = ''): void => {
  const blank = line === ''
  if (blank && lastBlank) return
  lastBlank = blank
  console.log(line)
}
const err = (line = ''): void => {
  const blank = line === ''
  if (blank && lastBlank) return
  lastBlank = blank
  console.error(line)
}

/** Product header: "◆ AxilJS v0.3.2 · tagline". */
export function banner(version: string, tagline?: string): void {
  out()
  out(`  ${brand(`${sym.logo} AxilJS`)} ${muted(`v${version}`)}${tagline ? muted(`  ${sym.dot}  ${tagline}`) : ''}`)
}

/** Command header: "◆ axil create · Create a new project". */
export function title(name: string, summary?: string): void {
  out()
  out(`  ${brand(`${sym.logo} axil ${name}`)}${summary ? muted(`  ${sym.dot}  ${summary}`) : ''}`)
  out()
}

/** Section heading inside a command's output. */
export function section(name: string): void {
  out()
  out(`  ${c.bold(name)}`)
}

/** A completed step: "  ✔ message  (details)". */
export function success(message: string, details?: string): void {
  out(`  ${c.green(sym.tick)} ${message}${details ? `  ${muted(details)}` : ''}`)
}

export function info(message: string, details?: string): void {
  out(`  ${c.blue(sym.info)} ${message}${details ? `  ${muted(details)}` : ''}`)
}

export function warn(message: string, details?: string): void {
  out(`  ${c.yellow(sym.warn)} ${c.yellow(message)}${details ? `  ${muted(details)}` : ''}`)
}

/** An in-progress or neutral step: "  › message". */
export function step(message: string, details?: string): void {
  out(`  ${muted(sym.arrow)} ${message}${details ? `  ${muted(details)}` : ''}`)
}

/** An indented, muted detail line under a step. */
export function detail(message: string): void {
  out(`    ${muted(message)}`)
}

/** Error line (stderr) with an optional hint underneath. */
export function error(message: string, hint?: string): void {
  err()
  err(`  ${c.red(sym.cross)} ${c.bold(message)}`)
  if (hint) err(`    ${muted(hint)}`)
  err()
}

/** A plain indented line. */
export function line(text = ''): void {
  out(text ? `  ${text}` : '')
}

/** Bulleted list. */
export function list(items: string[], bullet = sym.bullet): void {
  for (const item of items) out(`  ${muted(bullet)} ${item}`)
}

/**
 * Aligned columns. The first column is padded to the widest entry.
 *   table([['create <name>', 'Create a project'], ...])
 */
export function table(rows: string[][], options: { indent?: number; gap?: number } = {}): void {
  const indent = ' '.repeat(options.indent ?? 2)
  const gap = options.gap ?? 3
  const cols = Math.max(0, ...rows.map(r => r.length))
  const widths: number[] = []
  for (let i = 0; i < cols - 1; i++) {
    widths[i] = Math.max(0, ...rows.map(r => width(r[i] ?? '')))
  }
  for (const row of rows) {
    if (row.every(cell => cell === '')) { out(); continue }
    const cells = row.map((cell, i) => i < row.length - 1 ? pad(cell, widths[i] + gap) : cell)
    out(indent + cells.join(''))
  }
}

/** "label   value" pairs with aligned labels. */
export function keyValue(pairs: Array<[string, string]>): void {
  table(pairs.map(([k, v]) => [muted(k), v]), { indent: 4, gap: 2 })
}

/** Rounded box, e.g. for "Next steps". */
export function box(heading: string, lines: string[]): void {
  const inner = Math.max(width(heading) + 2, ...lines.map(l => width(l))) + 2
  const rest = sym.line.repeat(Math.max(0, inner - width(heading) - 3))
  out()
  out(`  ${muted(`${sym.tl}${sym.line} `)}${c.bold(heading)}${muted(` ${rest}${sym.tr}`)}`)
  for (const l of lines) out(`  ${muted(sym.v)} ${pad(l, inner - 2)} ${muted(sym.v)}`)
  out(`  ${muted(`${sym.bl}${sym.line.repeat(inner)}${sym.br}`)}`)
  out()
}

/** Final summary line: "  ✔ Done in 1.24s". */
export function done(message: string, startedAt?: number): void {
  const elapsed = startedAt !== undefined ? ` in ${formatDuration(Date.now() - startedAt)}` : ''
  out()
  out(`  ${c.green(sym.tick)} ${c.bold(message)}${muted(elapsed)}`)
  out()
}

/** Final failure line: "  ✖ Build failed". */
export function failed(message: string, hint?: string): void {
  out()
  out(`  ${c.red(sym.cross)} ${c.bold(c.red(message))}`)
  if (hint) out(`    ${muted(hint)}`)
  out()
}

// ============================================================================
// SPINNER
// ============================================================================

export interface Spinner {
  update(text: string): void
  succeed(text?: string, details?: string): void
  fail(text?: string, details?: string): void
  warn(text?: string, details?: string): void
  stop(): void
}

/**
 * Animated spinner on interactive terminals; a single "›" line otherwise
 * (CI logs, pipes, NO_COLOR) so output stays clean and diff-able.
 */
export function spinner(text: string): Spinner {
  const animate = Boolean(process.stdout.isTTY) && supportsColor
  let current = text
  let frame = 0
  let timer: NodeJS.Timeout | undefined

  const clear = (): void => {
    if (animate) process.stdout.write('\r\x1b[2K')
  }

  if (animate) {
    const render = (): void => {
      process.stdout.write(`\r\x1b[2K  ${c.cyan(SPINNER_FRAMES[frame])} ${current}`)
      frame = (frame + 1) % SPINNER_FRAMES.length
    }
    render()
    timer = setInterval(render, 80)
    timer.unref()
  } else {
    step(text)
  }

  const finish = (fn: () => void): void => {
    if (timer) clearInterval(timer)
    timer = undefined
    clear()
    fn()
  }

  return {
    update(next: string) {
      current = next
      if (!animate) step(next)
    },
    succeed(message = current, details?: string) { finish(() => success(message, details)) },
    fail(message = current, details?: string) {
      finish(() => out(`  ${c.red(sym.cross)} ${c.red(message)}${details ? `  ${muted(details)}` : ''}`))
    },
    warn(message = current, details?: string) { finish(() => warn(message, details)) },
    stop() { finish(() => undefined) }
  }
}
