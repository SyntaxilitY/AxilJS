import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as prompts from '../src/prompts'
import { stripAnsi } from '../src/ui'

type Key = { name?: string; ctrl?: boolean }

let written: string[]
const saved: Record<string, PropertyDescriptor | undefined> = {}

function fakeTty(): void {
  for (const [obj, key] of [[process.stdin, 'isTTY'], [process.stdout, 'isTTY'], [process.stdin, 'isRaw']] as const) {
    saved[`${obj === process.stdin ? 'in' : 'out'}.${key}`] = Object.getOwnPropertyDescriptor(obj, key)
  }
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
  Object.defineProperty(process.stdin, 'isRaw', { value: false, configurable: true })
  ;(process.stdin as any).setRawMode = vi.fn()
  vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin)
  vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin)
  written = []
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: any) => { written.push(String(chunk)); return true }) as any)
}

function restoreTty(): void {
  for (const [id, desc] of Object.entries(saved)) {
    const [which, key] = id.split('.')
    const obj = which === 'in' ? process.stdin : process.stdout
    if (desc) Object.defineProperty(obj, key, desc)
    else delete (obj as any)[key]
  }
  delete (process.stdin as any).setRawMode
  vi.restoreAllMocks()
}

/** Send keys once the prompt has attached its listener. */
async function press(...keys: Array<[string | undefined, Key]>): Promise<void> {
  await new Promise(r => setImmediate(r))
  for (const [str, key] of keys) process.stdin.emit('keypress', str, key)
}

const screen = (): string => stripAnsi(written.join(''))

describe('prompts without a TTY', () => {
  it('return their initial values immediately', async () => {
    const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
    expect(await prompts.select({ message: 'Pick', options: opts, initial: 'b' })).toBe('b')
    expect(await prompts.multiselect({ message: 'Pick', options: opts, initial: ['a'] })).toEqual(['a'])
    expect(await prompts.confirm({ message: 'Sure?', initial: true })).toBe(true)
    expect(await prompts.text({ message: 'Name', initial: 'api' })).toBe('api')
  })
})

describe('interactive prompts', () => {
  beforeEach(fakeTty)
  afterEach(restoreTty)

  const DBS = [
    { value: 'none', label: 'None' },
    { value: 'sqlite', label: 'SQLite', hint: 'Embedded file database' },
    { value: 'postgres', label: 'Postgres' }
  ]

  it('select moves with arrow keys, wraps around, and submits with enter', async () => {
    const answer = prompts.select({ message: 'Database', options: DBS })
    await press([undefined, { name: 'down' }], [undefined, { name: 'down' }], [undefined, { name: 'down' }], [undefined, { name: 'up' }], ['\r', { name: 'return' }])
    expect(await answer).toBe('postgres')
    expect(screen()).toContain('Database')
    expect(screen()).toContain('Embedded file database')
    expect(screen()).toContain('Postgres')
    expect(process.stdin.setRawMode).toHaveBeenCalledWith(true)
    expect(written.join('')).toContain('\x1b[?25h')
  })

  it('multiselect toggles with space and selects all with a', async () => {
    const opts = [{ value: 'auth', label: 'Auth' }, { value: 'ws', label: 'WebSocket' }, { value: 'queue', label: 'Queue' }]
    const first = prompts.multiselect({ message: 'Features', options: opts, initial: ['auth'] })
    await press([undefined, { name: 'down' }], [' ', { name: 'space' }], ['\r', { name: 'return' }])
    expect(await first).toEqual(['auth', 'ws'])
    expect(screen()).toContain('Auth, WebSocket')

    const all = prompts.multiselect({ message: 'Features', options: opts })
    await press(['a', { name: 'a' }], ['\r', { name: 'return' }])
    expect(await all).toEqual(['auth', 'ws', 'queue'])
  })

  it('confirm answers on y / n and toggles with arrows', async () => {
    const yes = prompts.confirm({ message: 'Create?', initial: false })
    await press(['y', { name: 'y' }])
    expect(await yes).toBe(true)

    const toggled = prompts.confirm({ message: 'Create?', initial: true })
    await press([undefined, { name: 'right' }], ['\r', { name: 'return' }])
    expect(await toggled).toBe(false)
  })

  it('text supports typing, backspace and validation', async () => {
    const name = prompts.text({
      message: 'Project name',
      validate: v => (v.length < 3 ? 'At least 3 characters' : undefined)
    })
    await press(['a', {}], ['p', {}], ['\r', { name: 'return' }])
    await press(['i', {}], ['x', {}], [undefined, { name: 'backspace' }], ['\r', { name: 'return' }])
    expect(await name).toBe('api')
    expect(screen()).toContain('At least 3 characters')
  })

  it('Ctrl+C cancels, restores the terminal and rejects with PromptCancelled', async () => {
    const answer = prompts.select({ message: 'Database', options: DBS })
    await press(['\x03', { name: 'c', ctrl: true }])
    await expect(answer).rejects.toBeInstanceOf(prompts.PromptCancelled)
    expect(screen()).toContain('Cancelled')
    expect(written.join('')).toContain('\x1b[?25h')
    expect(process.stdin.listenerCount('keypress')).toBe(0)
  })
})
