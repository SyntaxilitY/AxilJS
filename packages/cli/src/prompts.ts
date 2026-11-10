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
  result: () => T
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
      if ((key.ctrl && key.name === 'c') || key.name === 'escape') return finish(true)
      const outcome = onKey(str, key)
      if (outcome === 'submit') return finish(false)
      if (outcome === 'cancel') return finish(true)
      draw(render())
    }

    stdin.on('keypress', onKeypress)
    draw(render())
  })
}

function header(message: string, active: boolean): string {
  return active
    ? `  ${ui.c.cyan(ui.rail.active)}  ${ui.c.bold(message)}`
    : `  ${ui.c.green(ui.rail.done)}  ${message}`
}

function footer(text: string): string {
  return `  ${ui.c.cyan(ui.rail.end)}  ${ui.muted(text)}`
}

// ============================================================================
// SELECT
// ============================================================================

export async function select<T>(opts: {
  message: string
  options: Option<T>[]
  initial?: T
}): Promise<T> {
  const start = Math.max(0, opts.options.findIndex(o => o.value === opts.initial))
  if (!canPrompt()) return opts.options[start].value

  let cursor = start
  const labelWidth = Math.max(...opts.options.map(o => ui.width(o.label)))

  return run(
    () => [
      `  ${bar()}`,
      header(opts.message, true),
      ...opts.options.map((o, i) => {
        const on = i === cursor
        const mark = on ? ui.c.cyan(ui.rail.radioOn) : ui.muted(ui.rail.radioOff)
        const label = on ? ui.c.bold(ui.pad(o.label, labelWidth)) : ui.pad(o.label, labelWidth)
        return `  ${ui.c.cyan(ui.rail.bar)}  ${mark} ${label}${o.hint ? `   ${ui.muted(o.hint)}` : ''}`
      }),
      footer(`↑/↓ move ${ui.sym.dot} enter select`)
    ],
    (_str, key) => {
      if (key.name === 'up' || key.name === 'k') cursor = (cursor - 1 + opts.options.length) % opts.options.length
      else if (key.name === 'down' || key.name === 'j' || key.name === 'tab') cursor = (cursor + 1) % opts.options.length
      else if (key.name === 'return' || key.name === 'enter') return 'submit'
    },
    () => [`  ${bar()}`, header(opts.message, false), `  ${bar()}  ${ui.muted(opts.options[cursor].label)}`],
    () => opts.options[cursor].value
  )
}

// ============================================================================
// MULTISELECT
// ============================================================================

export async function multiselect<T>(opts: {
  message: string
  options: Option<T>[]
  initial?: T[]
}): Promise<T[]> {
  const chosen = new Set<T>(opts.initial ?? [])
  if (!canPrompt()) return opts.options.filter(o => chosen.has(o.value)).map(o => o.value)

  let cursor = 0
  const labelWidth = Math.max(...opts.options.map(o => ui.width(o.label)))
  const picked = (): Option<T>[] => opts.options.filter(o => chosen.has(o.value))

  return run(
    () => [
      `  ${bar()}`,
      header(opts.message, true),
      ...opts.options.map((o, i) => {
        const on = chosen.has(o.value)
        const mark = on ? ui.c.green(ui.rail.checkOn) : ui.muted(ui.rail.checkOff)
        const label = i === cursor ? ui.c.bold(ui.c.cyan(ui.pad(o.label, labelWidth))) : ui.pad(o.label, labelWidth)
        return `  ${ui.c.cyan(ui.rail.bar)}  ${mark} ${label}${o.hint ? `   ${ui.muted(o.hint)}` : ''}`
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

export async function confirm(opts: { message: string; initial?: boolean }): Promise<boolean> {
  let value = opts.initial ?? false
  if (!canPrompt()) return value

  return run(
    () => {
      const yes = value ? `${ui.c.cyan(ui.rail.radioOn)} ${ui.c.bold('Yes')}` : `${ui.muted(ui.rail.radioOff)} Yes`
      const no = !value ? `${ui.c.cyan(ui.rail.radioOn)} ${ui.c.bold('No')}` : `${ui.muted(ui.rail.radioOff)} No`
      return [
        `  ${bar()}`,
        header(opts.message, true),
        `  ${ui.c.cyan(ui.rail.bar)}  ${yes}   ${ui.muted('/')}   ${no}`,
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
        header(opts.message, true),
        `  ${ui.c.cyan(ui.rail.bar)}  ${shown}`,
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
