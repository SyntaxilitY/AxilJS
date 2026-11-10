import { describe, it, expect, vi, afterEach } from 'vitest'
import * as ui from '../src/ui'

function capture(fn: () => void): { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')) })
  const error = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { err.push(a.join(' ')) })
  try { fn() } finally { log.mockRestore(); error.mockRestore() }
  return { out, err }
}

afterEach(() => vi.restoreAllMocks())

describe('measuring', () => {
  it('strips ANSI codes and measures visible width', () => {
    expect(ui.stripAnsi('\x1b[1m\x1b[36mhi\x1b[39m\x1b[22m')).toBe('hi')
    expect(ui.width('\x1b[32mabc\x1b[39m')).toBe(3)
    expect(ui.pad('\x1b[32mab\x1b[39m', 5)).toBe('\x1b[32mab\x1b[39m   ')
    expect(ui.pad('abcdef', 3)).toBe('abcdef')
  })

  it('formats durations', () => {
    expect(ui.formatDuration(42)).toBe('42ms')
    expect(ui.formatDuration(1234)).toBe('1.23s')
    expect(ui.formatDuration(12_340)).toBe('12.3s')
    expect(ui.formatDuration(125_000)).toBe('2m 5s')
  })
})

describe('colour support', () => {
  it('prints plain text when stdout is not a TTY (test runner)', () => {
    expect(ui.supportsColor).toBe(false)
    expect(ui.c.red('x')).toBe('x')
    expect(ui.brand('AxilJS')).toBe('AxilJS')
  })
})

describe('layout', () => {
  it('aligns table columns by visible width', () => {
    const { out } = capture(() => ui.table([['a', 'one'], ['long-name', 'two'], ['']], { indent: 2, gap: 2 }))
    expect(out).toEqual(['  a          one', '  long-name  two', ''])
  })

  it('renders a box whose borders match its content width', () => {
    const { out } = capture(() => ui.box('Next steps', ['cd my-api', 'axil run']))
    const rows = out.filter(Boolean)
    const widths = rows.map(r => ui.width(r))
    expect(new Set(widths).size).toBe(1)
    expect(rows[0]).toContain('Next steps')
    expect(rows[1]).toContain('cd my-api')
  })

  it('writes errors with a hint to stderr', () => {
    const { out, err } = capture(() => ui.error('Unknown command', 'Run axil --help'))
    expect(out).toEqual([])
    expect(err.join('\n')).toContain('Unknown command')
    expect(err.join('\n')).toContain('Run axil --help')
  })

  it('reports elapsed time in done()', () => {
    const { out } = capture(() => ui.done('Build done', Date.now() - 1500))
    expect(out.join('\n')).toMatch(/Build done in 1\.\d\ds/)
  })
})

describe('spinner without a TTY', () => {
  it('prints step lines instead of animating and leaves no timer behind', () => {
    const { out } = capture(() => {
      const s = ui.spinner('Installing')
      s.update('Linking')
      s.succeed('Installed', '3 packages')
    })
    expect(out).toHaveLength(3)
    expect(out[0]).toContain('Installing')
    expect(out[1]).toContain('Linking')
    expect(out[2]).toContain('Installed')
    expect(out[2]).toContain('3 packages')
  })
})
