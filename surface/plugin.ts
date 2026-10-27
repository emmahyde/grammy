import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { parseFeedback, renderFeedback } from './feedback.ts'
import { SURFACE_BASE, SURFACE_HEADER, type Author, type DocSnapshot, type SurfaceStatus } from './protocol.ts'

const MAX_BODY = 1_000_000
const STARTER = 'flowchart TD\n  A[Start] --> B[Done]\n'
const LAYOUT_PREFIX = '%% mc:layout '

export interface SurfaceOptions {
  /** Shared diagram, relative to the Vite root. `GRAMMY_FILE` overrides it. */
  file?: string
}

const trimEnd = (s: string) => s.replace(/\s+$/, '')

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** Write via a temp file and rename, so a reader never sees half a file. */
function atomicWrite(file: string, content: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`)
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Dev-server seam between the human (browser) and the agent (file system):
 *  - `design.mmd` is the shared diagram. Pure Mermaid; the agent edits it with its normal tools.
 *  - `design.layout.json` holds the `%% mc:layout` line, so node drags never touch the agent's file.
 *  - `.grammy/inbox/NNNNNN.md` holds feedback until the agent picks it up with `npm run wait`.
 */
export function surfacePlugin(options: SurfaceOptions = {}): Plugin {
  return {
    name: 'grammy-surface',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const file = path.resolve(root, process.env.GRAMMY_FILE ?? options.file ?? 'design.mmd')
      const layoutFile = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.layout.json`)
      const stateDir = path.join(root, '.grammy')
      const inbox = path.join(stateDir, 'inbox')
      const delivered = path.join(stateDir, 'delivered')
      const waitingFile = path.join(stateDir, 'waiting.json')
      const relFile = path.relative(root, file)

      mkdirSync(inbox, { recursive: true })
      mkdirSync(delivered, { recursive: true })
      if (!existsSync(file)) writeFileSync(file, STARTER)

      let diskText = trimEnd(readFileSync(file, 'utf8'))
      let rev = 1

      function readLayout(): string | null {
        try {
          const line = (JSON.parse(readFileSync(layoutFile, 'utf8')) as { line?: unknown }).line
          return typeof line === 'string' ? line : null
        } catch {
          return null
        }
      }

      function writeLayout(line: string | null): void {
        if (line === readLayout()) return
        if (line === null) {
          if (existsSync(layoutFile)) unlinkSync(layoutFile)
          return
        }
        atomicWrite(layoutFile, JSON.stringify({ line }, null, 2) + '\n')
      }

      const snapshot = (author: Author): DocSnapshot => ({ rev, text: diskText, layout: readLayout(), author, file: relFile })

      // ---- server-sent events -------------------------------------------------
      const clients = new Set<ServerResponse>()
      const emit = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      const broadcast = (event: string, data: unknown) => {
        for (const res of clients) emit(res, event, data)
      }

      // the state dir is disposable (gitignored): a missing one reads as empty rather than crashing the dev server
      const seqs = (dir: string): number[] => {
        try {
          return readdirSync(dir)
            .filter((n) => /^\d+\.md$/.test(n))
            .map((n) => Number.parseInt(n, 10))
            .sort((a, b) => a - b)
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
          throw e
        }
      }

      function listening(): boolean {
        try {
          const pid = (JSON.parse(readFileSync(waitingFile, 'utf8')) as { pid?: unknown }).pid
          return typeof pid === 'number' && pidAlive(pid)
        } catch {
          return false
        }
      }

      let lastStatus = ''
      function pushStatus(force = false): void {
        const status: SurfaceStatus = { pending: seqs(inbox), delivered: seqs(delivered).slice(-20), listening: listening() }
        const key = JSON.stringify(status)
        if (!force && key === lastStatus) return
        lastStatus = key
        broadcast('status', status)
      }

      // ---- the agent edits the file ------------------------------------------
      let fsTimer: ReturnType<typeof setTimeout> | null = null
      function onFileEvent(changed: string): void {
        if (path.resolve(changed) !== file) return
        if (fsTimer !== null) clearTimeout(fsTimer)
        // editors write in several steps; settle before reading
        fsTimer = setTimeout(() => {
          let next: string
          try {
            next = trimEnd(readFileSync(file, 'utf8'))
          } catch {
            return
          }
          if (next === diskText) return
          diskText = next
          rev++
          broadcast('doc', snapshot('agent'))
        }, 60)
      }
      server.watcher.add(file)
      server.watcher.on('change', onFileEvent)
      server.watcher.on('add', onFileEvent)

      for (const dir of [stateDir, inbox, delivered]) {
        try {
          const w = watch(dir, () => pushStatus())
          w.unref()
          w.on('error', () => {}) // the dir was deleted; the 5 s tick keeps status fresh
          server.httpServer?.once('close', () => w.close())
        } catch {
          // a missing watcher only delays status updates until the next tick
        }
      }
      // a killed `npm run wait` leaves a stale pid file; notice it
      const tick = setInterval(() => pushStatus(), 5000)
      const beat = setInterval(() => {
        for (const res of clients) res.write(': keepalive\n\n')
      }, 25_000)
      tick.unref()
      beat.unref()
      server.httpServer?.once('close', () => {
        clearInterval(tick)
        clearInterval(beat)
        for (const res of clients) res.end()
      })

      server.httpServer?.once('listening', () => {
        server.config.logger.info(`  \x1b[32m➜\x1b[0m  Surface: shared diagram is ${relFile}; the agent listens with \`npm run wait\``)
      })

      // ---- HTTP ---------------------------------------------------------------
      server.middlewares.use(SURFACE_BASE, (req, res, next) => {
        const route = (req.url ?? '/').split('?')[0]
        const method = req.method ?? 'GET'
        if (method !== 'GET' && req.headers[SURFACE_HEADER] !== '1') {
          sendJson(res, 403, { error: `missing ${SURFACE_HEADER} header` })
          return
        }

        if (method === 'GET' && route === '/doc') {
          sendJson(res, 200, snapshot('disk'))
          return
        }

        if (method === 'GET' && route === '/events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' })
          res.write('retry: 1500\n\n')
          clients.add(res)
          req.on('close', () => clients.delete(res))
          // a client that connects, or reconnects, learns the current revision and agent state
          emit(res, 'doc', snapshot('disk'))
          pushStatus(true)
          return
        }

        if (method === 'PUT' && route === '/doc') {
          void (async () => {
            try {
              const b = (await readBody(req)) as { baseRev?: unknown; text?: unknown; layout?: unknown }
              if (typeof b.text !== 'string') return sendJson(res, 400, { error: 'text must be a string' })
              if (b.layout !== null && (typeof b.layout !== 'string' || !b.layout.startsWith(LAYOUT_PREFIX) || b.layout.includes('\n'))) {
                return sendJson(res, 400, { error: 'layout must be null or one `%% mc:layout` line' })
              }
              if (b.baseRev !== rev) return sendJson(res, 409, snapshot('agent'))
              const text = trimEnd(b.text)
              if (text !== diskText) {
                atomicWrite(file, text + '\n')
                diskText = text
                rev++
              }
              writeLayout(b.layout)
              sendJson(res, 200, { rev })
            } catch (e) {
              sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) })
            }
          })()
          return
        }

        if (method === 'POST' && route === '/feedback') {
          void (async () => {
            try {
              const payload = parseFeedback(await readBody(req))
              mkdirSync(inbox, { recursive: true })
              mkdirSync(delivered, { recursive: true })
              const seq = Math.max(0, ...seqs(inbox), ...seqs(delivered)) + 1
              const name = `${String(seq).padStart(6, '0')}.md`
              atomicWrite(path.join(inbox, name), renderFeedback(payload, { file: relFile, source: diskText, seq }))
              pushStatus()
              sendJson(res, 200, { seq })
            } catch (e) {
              sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) })
            }
          })()
          return
        }

        next()
      })
    },
  }
}
