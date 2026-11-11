/**
 * AxilJS CLI — interactive prompts (arrow keys, space, enter).
 *
 * Dependency-free select / multiselect / confirm / text prompts drawn on
 * the ui.ts rail:
 *
 *   ◆  Database
 *   │  ● SQLite     Embedded file database
 *   │  ○ Postgres
 *   └  ↑/↓ move · enter select
 *
 * After an answer the prompt collapses to "◇  Database" + the choice.
 * Without a TTY (CI, pipes) every prompt returns its initial value
 * immediately. Ctrl+C / Esc cancels: the terminal is restored and
 * `PromptCancelled` is thrown.
 */

import { emitKeypressEvents } from 'node:readline'
import * as ui from './ui'

export class PromptCancelled extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'PromptCancelled'
  }
}

export interface Option<T> {
  value: T
  label: string
  hint?: string
}

/** True when both stdin and stdout are terminals (prompts can be shown). */
export function canPrompt(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

interface Key {
  name?: string
  ctrl?: boolean
  sequence?: string
}

type KeyResult = 'submit' | 'cancel' | void

const bar = (): string => ui.muted(ui.rail.bar)

/** Clip a line to the terminal width so redraw line counts stay exact. */
function clip(line: string): string {
  const cols = (process.stdout.columns || 100) - 1
  if (ui.width(line) <= cols) return line
  return ui.stripAnsi(line).slice(0, Math.max(0, cols - 1)) + '…'
}

/**
 * Run one prompt: draw `render()`, feed keys to `onKey`, redraw on change,
 * and finally replace the frame with `summary()`.
 */
function run<T>(
  render: () => string[],
  onKey: (str: string | undefined, key: Key) => KeyResult,
  summary: () => string[],
  result: () => T,
  /** When true, Esc goes to onKey instead of cancelling (e.g. leave a search). */
  ownsEscape: () => boolean = () => false
): Promise<T> {
  const stdin = process.stdin
  const stdout = process.stdout
  let drawn = 0

  const draw = (lines: string[]): void => {
    const frame = lines.map(clip)
    let buf = ''
    if (drawn > 0) buf += `\x1b[${drawn}F\x1b[0J`
    buf += frame.join('\n') + '\n'
    stdout.write(buf)
    drawn = frame.length
  }

  return new Promise<T>((resolve, reject) => {
    const wasRaw = stdin.isRaw
    emitKeypressEvents(stdin)
    stdin.setRawMode(true)
    stdin.resume()
    stdout.write('\x1b[?25l')

    const finish = (cancelled: boolean): void => {
      stdin.removeListener('keypress', onKeypress)
      stdin.setRawMode(wasRaw)
      stdin.pause()
      if (cancelled) {
        draw([`  ${bar()}`, `  ${ui.c.red(ui.rail.error)}  ${ui.c.red('Cancelled')}`])
      } else {
        draw(summary())
      }
      stdout.write('\x1b[?25h')
      ui.noteRawOutput(false)
      if (cancelled) reject(new PromptCancelled())
      else resolve(result())
    }

    const onKeypress = (str: string | undefined, key: Key = {}): void => {
      if (key.ctrl && key.name === 'c') return finish(true)
      if (key.name === 'escape' && !ownsEscape()) return finish(true)
      const outcome = onKey(str, key)
      if (outcome === 'submit') return finish(false)
      if (outcome === 'cancel') return finish(true)
      draw(render())
    }

    stdin.on('keypress', onKeypress)
    draw(render())
  })
}

/** Prompt heading; `step` ("2/4") is shown dimmed after the message. */
function header(message: string, active: boolean, step?: string): string {
  const counter = step ? `  ${ui.muted(step)}` : ''
  return active
    ? `  ${ui.accent(ui.rail.active)}  ${ui.c.bold(message)}${counter}`
    : `  ${ui.c.green(ui.rail.done)}  ${message}`
}

function footer(text: string): string {
  return `  ${ui.accent(ui.rail.end)}  ${ui.muted(text)}`
}

/** Active-prompt line: "  │  text" with a cyan bar. */
function row(text: string): string {
  return `  ${ui.accent(ui.rail.bar)}  ${text}`
}

/** Visible window [start, end) of `size` rows that keeps `cursor` in view. */
function windowAround(total: number, cursor: number, size: number): [number, number] {
  if (total <= size) return [0, total]
  const start = Math.min(Math.max(0, cursor - Math.floor(size / 2)), total - size)
  return [start, start + size]
}

/** Rows that fit the terminal for a list, leaving room for chrome. */
function fitRows(chrome: number, preferred: number): number {
  const rows = process.stdout.rows || 24
  return Math.max(3, Math.min(preferred, rows - chrome))
}

const isUp = (key: Key): boolean => key.name === 'up' || key.name === 'k'
const isDown = (key: Key): boolean => key.name === 'down' || key.name === 'j'
const isChoose = (key: Key): boolean => key.name === 'return' || key.name === 'enter' || key.name === 'space'

// ============================================================================
// SELECT
// ============================================================================

export async function select<T>(opts: {
  message: string
  options: Option<T>[]
  initial?: T
  /** Step counter shown next to the message, e.g. "2/4". */
  step?: string
  /** Rows shown before the list scrolls (default: fits the terminal, max 10). */
  maxVisible?: number
}): Promise<T> {
  const start = Math.max(0, opts.options.findIndex(o => o.value === opts.initial))
  if (!canPrompt()) return opts.options[start].value

  let cursor = start
  const total = opts.options.length
  const labelWidth = Math.max(...opts.options.map(o => ui.width(o.label)))

  return run(
    () => {
      const [from, to] = windowAround(total, cursor, opts.maxVisible ?? fitRows(6, 10))
      const lines = [`  ${bar()}`, header(opts.message, true, opts.step)]
      if (from > 0) lines.push(row(ui.muted(`  ↑ ${from} more`)))
      for (let i = from; i < to; i++) {
        const o = opts.options[i]
        const on = i === cursor
        const mark = on ? ui.accent(ui.rail.radioOn) : ui.muted(ui.rail.radioOff)
        const label = on ? ui.c.bold(ui.pad(o.label, labelWidth)) : ui.pad(o.label, labelWidth)
        lines.push(row(`${mark} ${label}${o.hint ? `   ${ui.muted(o.hint)}` : ''}`))
      }
      if (to < total) lines.push(row(ui.muted(`  ↓ ${total - to} more`)))
      lines.push(footer(`↑/↓ move ${ui.sym.dot} space/enter select`))
      return lines
    },
    (_str, key) => {
      if (isUp(key)) cursor = (cursor - 1 + total) % total
      else if (isDown(key) || key.name === 'tab') cursor = (cursor + 1) % total
      else if (key.name === 'home') cursor = 0
      else if (key.name === 'end') cursor = total - 1
      else if (isChoose(key)) return 'submit'
    },
    () => [`  ${bar()}`, header(opts.message, false), `  ${bar()}  ${ui.muted(opts.options[cursor].label)}`],
    () => opts.options[cursor].value
  )
}

// ============================================================================
// BROWSE (grouped picker with tabs, search and a details card)
// ============================================================================

export interface BrowseOption<T> extends Option<T> {
  /** Tab this option belongs to. */
  group: string
  /** Extra words matched by `/` search. */
  keywords?: string[]
}

export interface BrowseDetails {
  title: string
  /** Right-aligned in the card's top border, e.g. "port 3001". */
  meta?: string
  lines: string[]
}

/**
 *   ◆  Pick a template  2/4                          10 templates
 *   │   Start   APIs   Realtime   Background   AI   Production
 *   │           ────
 *   │  ❯ REST API          CRUD + SQLite + JWT auth
 *   │    SaaS API          Multi-tenant, flags, quotas
 *   │
 *   │   ╭─ REST API ─────────────── port 3001 ─╮
 *   │   │ • ORM + migrations (SQLite)          │
 *   │   ╰──────────────────────────────────────╯
 *   └  ↑↓ move · ←→ category · space/enter select · / search
 *
 * ↑/↓ walk the active tab and flow into the neighbouring tabs at the ends;
 * ←/→ (or tab) jump between tabs; "/" filters across every tab by label,
 * hint and keywords (esc leaves the search).
 */
export async function browse<T>(opts: {
  message: string
  options: BrowseOption<T>[]
  /** Tab order; groups not listed are appended in first-seen order. */
  groups?: string[]
  initial?: T
  step?: string
  details?: (option: BrowseOption<T>) => BrowseDetails | undefined
  /** Text right of the heading, e.g. "10 templates" (default: "<n> options"). */
  counter?: string
}): Promise<T> {
  const initialIndex = Math.max(0, opts.options.findIndex(o => o.value === opts.initial))
  if (!canPrompt()) return opts.options[initialIndex].value

  const seen = [...new Set(opts.options.map(o => o.group))]
  const groups = [...(opts.groups ?? []).filter(g => seen.includes(g)), ...seen.filter(g => !(opts.groups ?? []).includes(g))]

  let current: BrowseOption<T> = opts.options[initialIndex]
  let searching = false
  let query = ''

  const inGroup = (g: string): BrowseOption<T>[] => opts.options.filter(o => o.group === g)
  const matches = (): BrowseOption<T>[] => {
    const q = query.trim().toLowerCase()
    if (!q) return opts.options
    return opts.options.filter(o =>
      [o.label, o.hint ?? '', o.group, ...(o.keywords ?? [])].some(s => s.toLowerCase().includes(q))
    )
  }
  /** The list currently on screen. */
  const visible = (): BrowseOption<T>[] => (searching ? matches() : inGroup(current.group))

  const moveGroup = (delta: number): void => {
    const gi = groups.indexOf(current.group)
    const next = groups[(gi + delta + groups.length) % groups.length]
    current = inGroup(next)[0]
  }

  const moveItem = (delta: number): void => {
    const list = visible()
    if (list.length === 0) return
    const i = list.indexOf(current)
    if (searching || i < 0) {
      current = list[((i < 0 ? 0 : i + delta) + list.length) % list.length]
      return
    }
    if (i + delta >= list.length) { moveGroup(1); return }
    if (i + delta < 0) { moveGroup(-1); const l = inGroup(current.group); current = l[l.length - 1]; return }
    current = list[i + delta]
  }

  const cardWidth = (): number => Math.max(30, Math.min(64, (process.stdout.columns || 80) - 10))
  const labelWidth = Math.max(...opts.options.map(o => ui.width(o.label)))

  return run(
    () => {
      const counter = opts.counter ?? `${opts.options.length} options`
      const lines = [`  ${bar()}`, `${header(opts.message, true, opts.step)}   ${ui.muted(counter)}`]

      if (searching) {
        const found = matches().length
        lines.push(row(`${ui.accent('/')} ${query}${ui.c.inverse(' ')}  ${ui.muted(`${found} match${found === 1 ? '' : 'es'}`)}`))
        lines.push(row(''))
      } else {
        // Tabs, with an underline under the active one
        let tabs = ''
        let underline = ''
        for (const g of groups) {
          const on = g === current.group
          const text = ` ${g} `
          tabs += (on ? ui.c.bold(ui.accent(text)) : ui.muted(text)) + ' '
          underline += (on ? ui.accent(ui.sym.line.repeat(text.length)) : ' '.repeat(text.length)) + ' '
        }
        lines.push(row(tabs.trimEnd()))
        lines.push(row(underline.trimEnd()))
      }

      const list = visible()
      if (list.length === 0) {
        lines.push(row(ui.muted('  No matches. Backspace to edit, esc to clear.')))
      } else {
        if (!list.includes(current)) current = list[0]
        const size = fitRows(14, 8)
        const [from, to] = windowAround(list.length, list.indexOf(current), size)
        if (from > 0) lines.push(row(ui.muted(`  ↑ ${from} more`)))
        for (let i = from; i < to; i++) {
          const o = list[i]
          const on = o === current
          const pointer = on ? ui.accent(ui.sym.pointer) : ' '
          const label = on ? ui.c.bold(ui.pad(o.label, labelWidth)) : ui.pad(o.label, labelWidth)
          const group = searching ? `${ui.muted(o.group)}  ` : ''
          lines.push(row(`${pointer} ${label}   ${group}${ui.muted(o.hint ?? '')}`))
        }
        if (to < list.length) lines.push(row(ui.muted(`  ↓ ${list.length - to} more`)))
      }

      const d = list.length > 0 ? opts.details?.(current) : undefined
      if (d) {
        lines.push(row(''))
        for (const l of ui.cardLines(d.title, d.lines, { meta: d.meta, width: cardWidth() })) lines.push(row(` ${l}`))
      }

      lines.push(footer(searching
        ? `type to filter ${ui.sym.dot} ↑↓ move ${ui.sym.dot} enter select ${ui.sym.dot} esc back`
        : `↑↓ move ${ui.sym.dot} ←→ category ${ui.sym.dot} space/enter select ${ui.sym.dot} / search`))
      return lines
    },
    (str, key) => {
      if (searching) {
        if (key.name === 'escape') { searching = false; query = ''; return }
        if (key.name === 'up') { moveItem(-1); return }
        if (key.name === 'down' || key.name === 'tab') { moveItem(1); return }
        if (key.name === 'return' || key.name === 'enter') return matches().length > 0 ? 'submit' : undefined
        if (key.name === 'backspace') { query = query.slice(0, -1); return }
        if (str && !key.ctrl && str >= ' ' && str.length === 1) query += str
        return
      }
      if (str === '/') { searching = true; query = ''; return }
      if (isUp(key)) moveItem(-1)
      else if (isDown(key)) moveItem(1)
      else if (key.name === 'left' || key.name === 'h') moveGroup(-1)
      else if (key.name === 'right' || key.name === 'l' || key.name === 'tab') moveGroup(1)
      else if (isChoose(key)) return 'submit'
    },
    () => [`  ${bar()}`, header(opts.message, false), `  ${bar()}  ${ui.muted(current.label)}`],
    () => current.value,
    // Esc leaves search instead of cancelling the whole prompt
    () => searching
  )
}

// ============================================================================
// MULTISELECT
// ============================================================================

export async function multiselect<T>(opts: {
  message: string
  options: Option<T>[]
  initial?: T[]
  step?: string
}): Promise<T[]> {
  const chosen = new Set<T>(opts.initial ?? [])
  if (!canPrompt()) return opts.options.filter(o => chosen.has(o.value)).map(o => o.value)

  let cursor = 0
  const labelWidth = Math.max(...opts.options.map(o => ui.width(o.label)))
  const picked = (): Option<T>[] => opts.options.filter(o => chosen.has(o.value))

  return run(
    () => [
      `  ${bar()}`,
      header(opts.message, true, opts.step),
      ...opts.options.map((o, i) => {
        const on = chosen.has(o.value)
        const mark = on ? ui.c.green(ui.rail.checkOn) : ui.muted(ui.rail.checkOff)
        const label = i === cursor ? ui.c.bold(ui.accent(ui.pad(o.label, labelWidth))) : ui.pad(o.label, labelWidth)
        return `  ${ui.accent(ui.rail.bar)}  ${mark} ${label}${o.hint ? `   ${ui.muted(o.hint)}` : ''}`
      }),
      footer(`↑/↓ move ${ui.sym.dot} space toggle ${ui.sym.dot} a all ${ui.sym.dot} enter confirm`)
    ],
    (str, key) => {
      if (key.name === 'up' || key.name === 'k') cursor = (cursor - 1 + opts.options.length) % opts.options.length
      else if (key.name === 'down' || key.name === 'j' || key.name === 'tab') cursor = (cursor + 1) % opts.options.length
      else if (key.name === 'space') {
        const v = opts.options[cursor].value
        if (chosen.has(v)) chosen.delete(v)
        else chosen.add(v)
      } else if (str === 'a') {
        if (chosen.size === opts.options.length) chosen.clear()
        else opts.options.forEach(o => chosen.add(o.value))
      } else if (key.name === 'return' || key.name === 'enter') return 'submit'
    },
    () => [
      `  ${bar()}`,
      header(opts.message, false),
      `  ${bar()}  ${ui.muted(picked().map(o => o.label).join(', ') || 'none')}`
    ],
    () => picked().map(o => o.value)
  )
}

// ============================================================================
// CONFIRM
// ============================================================================

export async function confirm(opts: { message: string; initial?: boolean; step?: string }): Promise<boolean> {
  let value = opts.initial ?? false
  if (!canPrompt()) return value

  return run(
    () => {
      const yes = value ? `${ui.accent(ui.rail.radioOn)} ${ui.c.bold('Yes')}` : `${ui.muted(ui.rail.radioOff)} Yes`
      const no = !value ? `${ui.accent(ui.rail.radioOn)} ${ui.c.bold('No')}` : `${ui.muted(ui.rail.radioOff)} No`
      return [
        `  ${bar()}`,
        header(opts.message, true, opts.step),
        `  ${ui.accent(ui.rail.bar)}  ${yes}   ${ui.muted('/')}   ${no}`,
        footer(`←/→ or y/n ${ui.sym.dot} enter confirm`)
      ]
    },
    (str, key) => {
      if (['left', 'right', 'tab', 'h', 'l'].includes(key.name ?? '')) value = !value
      else if (str === 'y' || str === 'Y') { value = true; return 'submit' }
      else if (str === 'n' || str === 'N') { value = false; return 'submit' }
      else if (key.name === 'return' || key.name === 'enter') return 'submit'
    },
    () => [`  ${bar()}`, header(opts.message, false), `  ${bar()}  ${ui.muted(value ? 'Yes' : 'No')}`],
    () => value
  )
}

// ============================================================================
// TEXT
// ============================================================================

export async function text(opts: {
  message: string
  initial?: string
  placeholder?: string
  validate?: (value: string) => string | undefined
  step?: string
}): Promise<string> {
  let value = opts.initial ?? ''
  if (!canPrompt()) return value

  let problem: string | undefined

  return run(
    () => {
      const shown = value
        ? `${value}${ui.c.inverse(' ')}`
        : `${ui.c.inverse(' ')}${ui.muted(opts.placeholder ?? '')}`
      return [
        `  ${bar()}`,
        header(opts.message, true, opts.step),
        `  ${ui.accent(ui.rail.bar)}  ${shown}`,
        problem ? `  ${ui.c.yellow(ui.rail.end)}  ${ui.c.yellow(problem)}` : footer('enter confirm')
      ]
    },
    (str, key) => {
      if (key.name === 'return' || key.name === 'enter') {
        problem = opts.validate?.(value)
        if (!problem) return 'submit'
        return
      }
      problem = undefined
      if (key.name === 'backspace') value = value.slice(0, -1)
      else if (str && !key.ctrl && str >= ' ' && str.length === 1) value += str
    },
    () => [`  ${bar()}`, header(opts.message, false), `  ${bar()}  ${ui.muted(value)}`],
    () => value
  )
}
