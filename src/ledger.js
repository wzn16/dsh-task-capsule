// dsh-task-capsule · 账本：会话收尾记录的持久层。
//
// 单写者模型：只有 host 进程写账本，浏览器侧只读路由。
//  - ledger.jsonl  追加写，一行一条收尾记录（崩溃最多丢最后一行）
//  - ledger.1.jsonl 轮转后的上一代（只留一代）
//  - open.json     运行中的任务快照，原子重写 + 5s 节流
//  - meta.json     已读位、计数、错误计数
// 目录：${DSH_HOME:-~/.dsh}/dsh-task-capsule/
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const SCHEMA_VERSION = 1
const MAX_RECORDS = 1000
const MAX_BYTES = 2 * 1024 * 1024
const OPEN_THROTTLE_MS = 5000

export function ledgerDir() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-task-capsule')
}

export function ledgerPaths() {
  const dir = ledgerDir()
  return {
    dir,
    open: path.join(dir, 'open.json'),
    ledger: path.join(dir, 'ledger.jsonl'),
    rotated: path.join(dir, 'ledger.1.jsonl'),
    meta: path.join(dir, 'meta.json'),
  }
}

/** 记录主键：同一会话同一结束时刻即同一条。 */
export function makeRecordId(record) {
  return String(record.sessionId || '') + ':' + String(record.endTime || 0)
}

/** 解析 jsonl：坏行跳过并计数，不因一行坏掉整卷。 */
export function parseLedgerLines(text) {
  const out = []
  let errors = 0
  for (const line of String(text || '').split('\n')) {
    const s = line.trim()
    if (!s) continue
    try {
      const v = JSON.parse(s)
      if (v && typeof v === 'object' && v.sessionId) out.push(v)
      else errors++
    } catch {
      errors++
    }
  }
  return { records: out, errors }
}

/** 未读：结束时间晚于已读位，且不是崩溃恢复出来的陈年记录。 */
export function countUnread(records, lastReadAt) {
  const since = Number(lastReadAt) || 0
  let n = 0
  for (const r of records) if ((r.endTime || 0) > since) n++
  return n
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }) } catch { /* 目录已存在或无权限，后续写会报错并计数 */ }
}

function readJsonFile(file, fallback) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))
    return v && typeof v === 'object' ? v : fallback
  } catch { return fallback }
}

function atomicWrite(file, text) {
  const tmp = file + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function createLedger({ log = console } = {}) {
  const files = ledgerPaths()
  const meta = {
    lastReadAt: 0,
    completedCount: 0,
    parseErrors: 0,
    writeErrors: 0,
    recovered: 0,
  }
  let records = [] // 新 → 旧
  let seq = 0
  let lastOpenWrite = 0
  let loaded = false

  /** 启动时读盘：账本 + meta；整卷不可读时改名保留，不静默清空。 */
  function load() {
    if (loaded) return records
    loaded = true
    ensureDir(files.dir)

    const savedMeta = readJsonFile(files.meta, null)
    if (savedMeta) {
      meta.lastReadAt = Number(savedMeta.lastReadAt) || 0
      meta.completedCount = Number(savedMeta.completedCount) || 0
      meta.parseErrors = Number(savedMeta.parseErrors) || 0
      meta.recovered = Number(savedMeta.recovered) || 0
    }

    try {
      const text = fs.readFileSync(files.ledger, 'utf8')
      const parsed = parseLedgerLines(text)
      meta.parseErrors += parsed.errors
      records = parsed.records
    } catch {
      records = [] // 文件还不存在，属正常
    }

    records.sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
    seq = records.reduce((m, r) => Math.max(m, Number(r.seq) || 0), 0)
    if (meta.parseErrors > 0) log.warn('[dsh-task-capsule] ledger parse errors:', meta.parseErrors)
    return records
  }

  /** 崩溃恢复：open.json 里还挂着的任务，补一条 interrupted 记录。 */
  function recoverOpen() {
    const open = readJsonFile(files.open, null)
    if (!open || !Array.isArray(open.active) || open.active.length === 0) return []
    const out = []
    for (const item of open.active) {
      if (!item || !item.sessionId) continue
      out.push(append({
        sessionId: item.sessionId,
        title: item.title || '(无标题)',
        duration: Math.max(0, (Number(item.lastActivityAt) || Number(open.at) || Date.now()) - (Number(item.startTime) || 0)),
        turns: Number(item.turns) || 0,
        steps: Number(item.steps) || 0,
        toolCalls: Number(item.toolCalls) || 0,
        models: [],
        provider: '',
        endReason: 'interrupted',
        errorMessage: '',
        startTime: Number(item.startTime) || 0,
        endTime: Number(item.lastActivityAt) || Date.now(),
        recovered: true,
      }))
      meta.recovered++
    }
    saveMeta()
    saveOpen([])
    return out
  }

  function saveMeta() {
    try { atomicWrite(files.meta, JSON.stringify(meta, null, 2)) } catch (e) {
      meta.writeErrors++
      log.warn('[dsh-task-capsule] meta write failed:', (e && e.message) || String(e))
    }
  }

  function rotateIfNeeded() {
    try {
      const st = fs.statSync(files.ledger)
      if (st.size < MAX_BYTES) return
    } catch { return }
    try { fs.renameSync(files.ledger, files.rotated) } catch { /* 轮转失败不阻断追加 */ }
  }

  /** 追加一条收尾记录（补 seq/recordId/时间，返回落盘后的记录）。 */
  function append(record) {
    const now = Date.now()
    const r = {
      schemaVersion: SCHEMA_VERSION,
      ...record,
      seq: ++seq,
      createdAt: now,
    }
    r.recordId = makeRecordId(r)
    try {
      ensureDir(files.dir)
      rotateIfNeeded()
      fs.appendFileSync(files.ledger, JSON.stringify(r) + '\n', { mode: 0o600 })
    } catch (e) {
      meta.writeErrors++
      log.warn('[dsh-task-capsule] ledger append failed:', (e && e.message) || String(e))
    }
    records.unshift(r)
    if (records.length > MAX_RECORDS) records.length = MAX_RECORDS
    meta.completedCount++
    saveMeta()
    return r
  }

  /** 运行中快照落盘（节流 5s），崩溃后靠它恢复。 */
  function saveOpen(active, at = Date.now(), force = false) {
    if (!force && at - lastOpenWrite < OPEN_THROTTLE_MS) return
    lastOpenWrite = at
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      at,
      active: (active || []).map((item) => ({
        sessionId: item.sessionId,
        title: item.title,
        startTime: item.startTime,
        lastActivityAt: item.lastActivityAt,
        steps: item.steps,
        turns: item.turns,
        toolCalls: item.toolCalls,
      })),
    }
    try {
      ensureDir(files.dir)
      atomicWrite(files.open, JSON.stringify(payload, null, 2))
    } catch (e) {
      meta.writeErrors++
      log.warn('[dsh-task-capsule] open.json write failed:', (e && e.message) || String(e))
    }
  }

  /** 标记已读到某一时刻。 */
  function markRead(at = Date.now()) {
    meta.lastReadAt = Number(at) || Date.now()
    saveMeta()
    return meta.lastReadAt
  }

  function unread() {
    return countUnread(records, meta.lastReadAt)
  }

  function stats() {
    return {
      unread: unread(),
      lastReadAt: meta.lastReadAt,
      completedCount: meta.completedCount,
      parseErrors: meta.parseErrors,
      writeErrors: meta.writeErrors,
      recovered: meta.recovered,
      stored: records.length,
    }
  }

  return {
    load,
    recoverOpen,
    append,
    saveOpen,
    markRead,
    unread,
    stats,
    records: () => records.slice(),
    paths: files,
  }
}
