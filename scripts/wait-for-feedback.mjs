#!/usr/bin/env node
// Blocks until the human sends feedback from the Grammy surface, prints it to stdout, exits 0.
//
//   npm run wait                  wait forever
//   npm run wait -- --timeout 600 give up after 600 s (exit 2)
//   npm run wait -- --dir <root>  project root that holds .grammy/ (default: cwd)
//
// While it runs it writes .grammy/waiting.json so the surface can show "agent is listening".
// Feedback files move from .grammy/inbox to .grammy/delivered once printed.
import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}

const root = path.resolve(flag('--dir', process.cwd()))
const timeoutSec = Number(flag('--timeout', '0'))
if (!Number.isFinite(timeoutSec) || timeoutSec < 0) {
  console.error('--timeout must be a number of seconds (0 = wait forever)')
  process.exit(64)
}

const stateDir = path.join(root, '.grammy')
const inbox = path.join(stateDir, 'inbox')
const delivered = path.join(stateDir, 'delivered')
const waitingFile = path.join(stateDir, 'waiting.json')
mkdirSync(inbox, { recursive: true })
mkdirSync(delivered, { recursive: true })

/** Moves every pending feedback file to delivered/ and returns their text in order, or null if none. */
function takePending() {
  const names = readdirSync(inbox)
    .filter((n) => /^\d+\.md$/.test(n))
    .sort()
  const taken = []
  for (const name of names) {
    try {
      const text = readFileSync(path.join(inbox, name), 'utf8')
      renameSync(path.join(inbox, name), path.join(delivered, name))
      taken.push(text)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e // another waiter took it first
    }
  }
  return taken.length > 0 ? taken.join('\n') : null
}

function clearWaiting() {
  try {
    unlinkSync(waitingFile)
  } catch {
    // already gone
  }
}

function finish(text) {
  clearWaiting()
  process.stdout.write(text, () => process.exit(0))
}

const early = takePending()
if (early !== null) {
  process.stdout.write(early, () => process.exit(0))
} else {
  writeFileSync(waitingFile, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }))
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      clearWaiting()
      process.exit(130)
    })
  }
  console.error(`Waiting for feedback from the Grammy surface (${path.relative(process.cwd(), inbox) || inbox})…`)

  const check = () => {
    const text = takePending()
    if (text !== null) finish(text)
  }
  watch(inbox, check)
  setInterval(check, 1000) // fs.watch can miss events on some file systems
  if (timeoutSec > 0) {
    setTimeout(() => {
      clearWaiting()
      console.error(`No feedback within ${timeoutSec}s.`)
      process.exit(2)
    }, timeoutSec * 1000)
  }
}
