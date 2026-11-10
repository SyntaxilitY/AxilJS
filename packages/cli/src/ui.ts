/**
 * AxilJS CLI — terminal UI kit.
 *
 * One place for every colour, symbol and layout primitive the CLI prints,
 * so all commands share the same look. Dependency-free.
 *
 * Look: a gradient AXIL wordmark and badges for headers, and a "rail" for
 * command flows:
 *
 *   ┌  axil migrate  Apply pending migrations
 *   │
 *   ◇  001_create_users
 *   ▲  Skipped 002 (already applied)
 *   │
 *   └  Done in 90ms
 *
 * `title()` opens the rail; every helper below then draws on it until
 * `box()`, `failed()`, `error()` or `outro()` closes it (or the process
 * exits). Without an open rail, helpers print plain indented lines.
 *
 *   - Colours honour NO_COLOR, FORCE_COLOR, TERM=dumb and non-TTY output
 *   - Truecolor gradients/badges where supported, 16-colour fallback otherwise
 *   - Unicode symbols fall back to ASCII on legacy Windows consoles
 *   - Clickable links (OSC 8) in terminals that support them
 *   - Layout helpers measure visible width (escape codes stripped)
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

function detectTrueColor(): boolean {
  const env = process.env
  if (!supportsColor) return false
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return true
  if (env.WT_SESSION) return true
  return ['vscode', 'iTerm.app', 'WezTerm', 'Hyper', 'ghostty'].includes(env.TERM_PROGRAM ?? '')
}

function detectLinks(): boolean {
  const env = process.env
  if (!supportsColor || env.CI) return false
  if (env.WT_SESSION) return true
  if (['vscode', 'iTerm.app', 'WezTerm', 'ghostty'].includes(env.TERM_PROGRAM ?? '')) return true
  return Number(env.VTE_VERSION ?? 0) >= 5000
}

export const supportsColor     = detectColor()
export const supportsUnicode   = detectUnicode()
export const supportsTrueColor = detectTrueColor()
export const supportsLinks     = detectLinks()

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
  inverse:   code(7, 27),
  red:       code(31, 39),
  green:     code(32, 39),
  yellow:    code(33, 39),
  blue:      code(34, 39),
  magenta:   code(35, 39),
  cyan:      code(36, 39),
  gray:      code(90, 39)
}

type RGB = [number, number, number]

function hex(value: string): RGB {
  const n = parseInt(value.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** AxilJS brand gradient: cyan → indigo. */
const BRAND: RGB[] = [hex('#22d3ee'), hex('#818cf8')]

/** Truecolor foreground; falls back to the given 16-colour paint. */
export function rgb(colour: string, fallback: Paint = c.cyan): Paint {
  const [r, g, b] = hex(colour)
  return text => supportsTrueColor ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m` : fallback(text)
}

/** Per-character colour gradient (bold). Plain brand cyan without truecolor. */
export function gradient(text: string, stops: RGB[] = BRAND): string {
  if (!supportsTrueColor) return c.bold(c.cyan(text))
  const chars = Array.from(text)
  const last = Math.max(1, chars.length - 1)
  const out = chars.map((ch, i) => {
    if (ch === ' ') return ch
    const t = (i / last) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(t))
    const f = t - k
    const [r1, g1, b1] = stops[k]
    const [r2, g2, b2] = stops[k + 1]
    const mix = (a: number, b: number) => Math.round(a + (b - a) * f)
    return `\x1b[38;2;${mix(r1, r2)};${mix(g1, g2)};${mix(b1, b2)}m${ch}`
  })
  return c.bold(out.join('') + '\x1b[39m')
}

export type Tone = 'brand' | 'success' | 'warn' | 'error' | 'info' | 'muted'

const BADGE_TONES: Record<Tone, { bg: string; fg: string; basic: [number, number] }> = {
  brand:   { bg: '#22d3ee', fg: '#04141a', basic: [46, 30] },
  success: { bg: '#4ade80', fg: '#052e16', basic: [42, 30] },
  warn:    { bg: '#facc15', fg: '#1f1600', basic: [43, 30] },
  error:   { bg: '#f87171', fg: '#2a0606', basic: [41, 97] },
  info:    { bg: '#818cf8', fg: '#0b0d2e', basic: [44, 97] },
  muted:   { bg: '#334155', fg: '#e2e8f0', basic: [100, 97] }
}

/** Solid label, e.g. badge('AXIL') → " AXIL " on cyan. Bracketed without colour. */
export function badge(text: string, tone: Tone = 'brand'): string {
  if (!supportsColor) return `[${text}]`
  const t = BADGE_TONES[tone]
  if (supportsTrueColor) {
    const [br, bg, bb] = hex(t.bg)
    const [fr, fg, fb] = hex(t.fg)
    return `\x1b[48;2;${br};${bg};${bb}m\x1b[38;2;${fr};${fg};${fb}m\x1b[1m ${text} \x1b[22m\x1b[39m\x1b[49m`
  }
  return `\x1b[${t.basic[0]}m\x1b[${t.basic[1]}m\x1b[1m ${text} \x1b[22m\x1b[39m\x1b[49m`
}

/** Clickable link where the terminal supports OSC 8; plain text otherwise. */
export function link(url: string, text: string = url): string {
  if (!supportsLinks) return text === url ? url : `${text} (${url})`
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`
}

/** Brand colour (AxilJS cyan) — titles, commands, highlights. */
export const brand: Paint = text => c.bold(c.cyan(text))
/** A command or code fragment the user can type. */
export const cmd: Paint = text => rgb('#67e8f9')(text)
/** A file system path. */
export const path: Paint = text => c.underline(String(text))
/** De-emphasised supporting text. */
export const muted: Paint = text => c.gray(text)

// ============================================================================
// SYMBOLS
// ============================================================================

export const sym = supportsUnicode
  ? {
      logo: '▲', tick: '✔', cross: '✖', warn: '▲', info: 'ℹ', arrow: '›',
      pointer: '❯', bullet: '•', dot: '·', line: '─', next: '→',
      tl: '╭', tr: '╮', bl: '╰', br: '╯', v: '│'
    }
  : {
      logo: '^', tick: '√', cross: 'x', warn: '!', info: 'i', arrow: '>',
      pointer: '>', bullet: '*', dot: '-', line: '-', next: '->',
      tl: '+', tr: '+', bl: '+', br: '+', v: '|'
    }

/** Rail markers. */
export const rail = supportsUnicode
  ? { start: '┌', bar: '│', end: '└', active: '◆', done: '◇', info: '●', warn: '▲', error: '■', pending: '○',
      radioOn: '●', radioOff: '○', checkOn: '◼', checkOff: '◻' }
  : { start: '+', bar: '|', end: '+', active: '*', done: 'o', info: 'i', warn: '!', error: 'x', pending: '-',
      radioOn: '(*)', radioOff: '( )', checkOn: '[x]', checkOff: '[ ]' }

const SPINNER_FRAMES = supportsUnicode
  ? ['◒', '◐', '◓', '◑']
  : ['-', '\\', '|', '/']

// ============================================================================
// MEASURE
// ============================================================================

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\]8;;[^\x07]*\x07/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export function width(text: string): number {
  return Array.from(stripAnsi(text)).length
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
// OUTPUT + RAIL STATE
// ============================================================================

// Helpers pad themselves with blank lines; never print two in a row.
// One flag for both streams: they interleave on the same terminal.
let lastBlank = false
let railOpen = false

const out = (line = ''): void => {
  const blank = line === '' || stripAnsi(line).trim() === rail.bar
  if (blank && lastBlank) return
  lastBlank = blank
  console.log(line)
}
const err = (line = ''): void => {
  const blank = line === '' || stripAnsi(line).trim() === rail.bar
  if (blank && lastBlank) return
  lastBlank = blank
  console.error(line)
}

/** Whether a rail is currently open (a command flow is in progress). */
export function isRailOpen(): boolean {
  return railOpen
}

/** Internal: raw writes (prompts, spinners) reset the blank-line tracker. */
export function noteRawOutput(endsBlank = false): void {
  lastBlank = endsBlank
}

const bar = (): string => muted(rail.bar)

/** "  │  text" inside a rail, "  text" outside. */
function railLine(text: string): string {
  if (!railOpen) return text ? `  ${text}` : ''
  return text ? `  ${bar()}  ${text}` : `  ${bar()}`
}

/** "  ◇  text" inside a rail, "  ✔ text" outside. */
function marked(railMark: string, plainMark: string, text: string): string {
  return railOpen ? `  ${railMark}  ${text}` : `  ${plainMark} ${text}`
}

function closeRail(message?: string, write: (line?: string) => void = out): void {
  if (!railOpen) return
  railOpen = false
  write(`  ${bar()}`)
  write(`  ${muted(rail.end)}  ${message ?? ''}`.trimEnd())
  write()
}

process.on('exit', () => {
  if (railOpen) {
    railOpen = false
    console.log(`  ${muted(rail.end)}`)
  }
})

// ============================================================================
// HEADERS
// ============================================================================

/** Product header: "▲ AXIL  v0.3.2  The JavaScript Backend That Finally Rests." */
export function banner(version: string, tagline?: string): void {
  out()
  out(`  ${gradient(`${sym.logo} AXIL`)}  ${badge(`v${version}`, 'muted')}${tagline ? `  ${muted(tagline)}` : ''}`)
}

/** Opens the rail: "┌  axil create  Create a new project". */
export function title(name: string, summary?: string): void {
  if (railOpen) closeRail()
  out()
  out(`  ${muted(rail.start)}  ${gradient(`axil ${name}`)}${summary ? `  ${muted(summary)}` : ''}`)
  railOpen = true
  out(`  ${bar()}`)
}

/** Section heading. On the rail: "◆  Name". */
export function section(name: string): void {
  if (railOpen) {
    out(`  ${bar()}`)
    out(`  ${c.cyan(rail.active)}  ${c.bold(name)}`)
    return
  }
  out()
  out(`  ${c.bold(name)}`)
}

// ============================================================================
// STATUS LINES
// ============================================================================

const withDetails = (message: string, details?: string): string =>
  `${message}${details ? `  ${muted(details)}` : ''}`

/** A completed step. */
export function success(message: string, details?: string): void {
  out(marked(c.green(rail.done), c.green(sym.tick), withDetails(message, details)))
}

export function info(message: string, details?: string): void {
  out(marked(c.blue(rail.info), c.blue(sym.info), withDetails(message, details)))
}

export function warn(message: string, details?: string): void {
  out(marked(c.yellow(rail.warn), c.yellow(sym.warn), withDetails(c.yellow(message), details)))
}

/** An in-progress or neutral step. */
export function step(message: string, details?: string): void {
  out(marked(muted(rail.pending), muted(sym.arrow), withDetails(message, details)))
}

/** An indented, muted detail line under a step. */
export function detail(message: string): void {
  out(railOpen ? `  ${bar()}    ${muted(message)}` : `    ${muted(message)}`)
}

/** Error (stderr) with an optional hint. Closes an open rail. */
export function error(message: string, hint?: string): void {
  if (railOpen) {
    err(`  ${bar()}`)
    err(`  ${c.red(rail.error)}  ${c.bold(c.red(message))}`)
    if (hint) err(`  ${bar()}  ${muted(hint)}`)
    railOpen = false
    err(`  ${muted(rail.end)}`)
    err()
    return
  }
  err()
  err(`  ${c.red(sym.cross)} ${c.bold(message)}`)
  if (hint) err(`    ${muted(hint)}`)
  err()
}

/** A plain line (on the rail when one is open). */
export function line(text = ''): void {
  out(railLine(text))
}

/** Bulleted list. */
export function list(items: string[], bullet = sym.bullet): void {
  for (const item of items) out(railLine(`${muted(bullet)} ${item}`))
}

// ============================================================================
// TABLES
// ============================================================================

/**
 * Aligned columns. The first columns are padded to their widest entry.
 *   table([['create <name>', 'Create a project'], ...])
 * On the rail, `indent` is measured from the rail's text column.
 */
export function table(rows: string[][], options: { indent?: number; gap?: number } = {}): void {
  const indentSize = options.indent ?? 2
  const gap = options.gap ?? 3
  const cols = Math.max(0, ...rows.map(r => r.length))
  const widths: number[] = []
  for (let i = 0; i < cols - 1; i++) {
    widths[i] = Math.max(0, ...rows.map(r => r.length - 1 > i ? width(r[i] ?? '') : 0))
  }
  for (const row of rows) {
    if (row.every(cell => cell === '')) { out(railOpen ? `  ${bar()}` : ''); continue }
    const cells = row.map((cell, i) => i < row.length - 1 ? pad(cell, widths[i] + gap) : cell)
    const text = cells.join('')
    out(railOpen
      ? `  ${bar()}  ${' '.repeat(Math.max(0, indentSize - 2))}${text}`
      : `${' '.repeat(indentSize)}${text}`)
  }
}

/** "label   value" pairs with aligned labels. */
export function keyValue(pairs: Array<[string, string]>): void {
  table(pairs.map(([k, v]) => [muted(k), v]), { indent: 4, gap: 2 })
}

// ============================================================================
// ENDINGS
// ============================================================================

/**
 * "Next steps". On the rail it closes the flow:
 *   └  Next steps
 *      1. cd my-api
 * Off the rail it draws a rounded box.
 */
export function box(heading: string, lines: string[]): void {
  if (railOpen) {
    railOpen = false
    out(`  ${bar()}`)
    out(`  ${muted(rail.end)}  ${c.bold(heading)}`)
    for (const l of lines) out(`     ${l}`)
    out()
    return
  }
  const inner = Math.max(width(heading) + 2, ...lines.map(l => width(l))) + 2
  const rest = sym.line.repeat(Math.max(0, inner - width(heading) - 3))
  out()
  out(`  ${muted(`${sym.tl}${sym.line} `)}${c.bold(heading)}${muted(` ${rest}${sym.tr}`)}`)
  for (const l of lines) out(`  ${muted(sym.v)} ${pad(l, inner - 2)} ${muted(sym.v)}`)
  out(`  ${muted(`${sym.bl}${sym.line.repeat(inner)}${sym.br}`)}`)
  out()
}

/** Highlighted result line: "◆  Build done in 1.24s". The rail stays open. */
export function done(message: string, startedAt?: number): void {
  const elapsed = startedAt !== undefined ? ` in ${formatDuration(Date.now() - startedAt)}` : ''
  if (railOpen) {
    out(`  ${bar()}`)
    out(`  ${c.green(rail.active)}  ${c.bold(c.green(message))}${muted(elapsed)}`)
    return
  }
  out()
  out(`  ${c.green(sym.tick)} ${c.bold(message)}${muted(elapsed)}`)
  out()
}

/** Failure result. Closes an open rail. */
export function failed(message: string, hint?: string): void {
  if (railOpen) {
    out(`  ${bar()}`)
    out(`  ${c.red(rail.error)}  ${c.bold(c.red(message))}`)
    if (hint) out(`  ${bar()}  ${muted(hint)}`)
    closeRail()
    return
  }
  out()
  out(`  ${c.red(sym.cross)} ${c.bold(c.red(message))}`)
  if (hint) out(`    ${muted(hint)}`)
  out()
}

/** Close the rail with an optional closing message: "└  Done". */
export function outro(message?: string): void {
  if (railOpen) closeRail(message)
  else if (message) { out(`  ${message}`); out() }
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
 * Animated spinner on interactive terminals; a single step line otherwise
 * (CI logs, pipes, NO_COLOR) so output stays clean and diff-able.
 */
export function spinner(text: string): Spinner {
  const animate = Boolean(process.stdout.isTTY) && supportsColor
  let current = text
  let frame = 0
  let timer: NodeJS.Timeout | undefined
  const prefix = (): string => railOpen ? '  ' : '  '
  const gapAfter = (): string => railOpen ? '  ' : ' '

  const clear = (): void => {
    if (animate) process.stdout.write('\r\x1b[2K')
  }

  if (animate) {
    if (railOpen) out(`  ${bar()}`)
    const render = (): void => {
      process.stdout.write(`\r\x1b[2K${prefix()}${c.magenta(SPINNER_FRAMES[frame])}${gapAfter()}${current}`)
      frame = (frame + 1) % SPINNER_FRAMES.length
    }
    render()
    timer = setInterval(render, 90)
    timer.unref()
  } else {
    step(text)
  }

  const finish = (fn: () => void): void => {
    if (timer) clearInterval(timer)
    timer = undefined
    clear()
    noteRawOutput(false)
    fn()
  }

  return {
    update(next: string) {
      current = next
      if (!animate) step(next)
    },
    succeed(message = current, details?: string) { finish(() => success(message, details)) },
    fail(message = current, details?: string) {
      finish(() => out(marked(c.red(rail.error), c.red(sym.cross), withDetails(c.red(message), details))))
    },
    warn(message = current, details?: string) { finish(() => warn(message, details)) },
    stop() { finish(() => undefined) }
  }
}
