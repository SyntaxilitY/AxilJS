/**
 * Run a shell command with its output captured instead of streamed, so the
 * CLI can show a spinner while it runs and print the output only on failure.
 */

import { spawn } from 'node:child_process'

export interface CapturedResult {
  code:   number
  output: string
}

export function runCaptured(command: string, cwd: string): Promise<CapturedResult> {
  return new Promise((done, reject) => {
    const child = spawn(command, { cwd, shell: true, env: process.env })
    let output = ''
    child.stdout?.on('data', chunk => { output += chunk })
    child.stderr?.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('close', code => done({ code: code ?? 1, output }))
  })
}

/** npm's one-line result, e.g. "added 42 packages in 3s". */
export function npmSummary(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => /^(added|removed|changed|up to date)\b/.test(l))
}

/** Print captured output indented under a failed step. */
export function printCaptured(output: string, write: (line: string) => void): void {
  for (const line of output.replace(/\s+$/, '').split(/\r?\n/)) write(`    ${line}`)
}
