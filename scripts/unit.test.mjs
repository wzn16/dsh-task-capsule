// dsh-task-capsule · 纯函数与降级路径测试（node --test）
// 运行：node --test scripts/unit.test.mjs
// 覆盖：账本解析/未读/汇总/清洗、schema 越界只读降级、信任门、预设表。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 每个测试用独立 DSH_HOME，互不污染
function isolate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-'))
  process.env.DSH_HOME = dir
  return dir
}

const ledgerMod = await import('../src/ledger.js')
const core = await import('../src/host-core.js')
const platform = await import('../src/platform.js')

test('parseLedgerLines：坏行跳过并计数，好行保留', () => {
  const { records, errors } = ledgerMod.parseLedgerLines(
    '{"sessionId":"a","endTime":1}\nnot-json\n\n{"sessionId":"b","endTime":2}\n{"noSession":1}'
  )
  assert.equal(records.length, 2)
  assert.equal(errors, 2) // not-json + 缺 sessionId
})

test('parseLedgerLines：空输入不报错', () => {
  assert.deepEqual(ledgerMod.parseLedgerLines(''), { records: [], errors: 0 })
})

test('countUnread：严格大于已读位', () => {
  const recs = [{ endTime: 100 }, { endTime: 300 }, { endTime: 500 }]
  assert.equal(ledgerMod.countUnread(recs, 200), 2)
  assert.equal(ledgerMod.countUnread(recs, 500), 0)
  assert.equal(ledgerMod.countUnread(recs, 0), 3)
})

test('makeRecordId：同会话同结束时刻同主键', () => {
  const a = ledgerMod.makeRecordId({ sessionId: 's1', endTime: 42 })
  const b = ledgerMod.makeRecordId({ sessionId: 's1', endTime: 42 })
  const c = ledgerMod.makeRecordId({ sessionId: 's1', endTime: 43 })
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('summarizeRecords：失败与中断分列', () => {
  const s = ledgerMod.summarizeRecords([
    { duration: 1000, steps: 2, toolCalls: 3, approvalWaitMs: 500, endReason: 'completed' },
    { duration: 3000, endReason: 'error' },
    { duration: 2000, endReason: 'interrupted' },
    { duration: 500, endReason: 'disposed' },
    { duration: 800, endReason: 'completed', recovered: true },
  ])
  assert.equal(s.count, 5)
  assert.equal(s.durationMs, 7300)
  assert.equal(s.steps, 2)
  assert.equal(s.toolCalls, 3)
  assert.equal(s.approvalWaitMs, 500)
  assert.equal(s.failures, 1) // 只有 error
  assert.equal(s.interrupted, 3) // interrupted + disposed + recovered
  assert.equal(s.recovered, 1)
  assert.equal(s.slowest.duration, 3000)
})

test('summarizeRecords：空集不炸', () => {
  const s = ledgerMod.summarizeRecords([])
  assert.equal(s.count, 0)
  assert.equal(s.slowest, null)
})

test('stripTokenFields：清掉遗留 token 字段', () => {
  const recs = [{ sessionId: 'a', inputTokens: 1, totalTokens: 2, title: 'x' }]
  assert.equal(ledgerMod.stripTokenFields(recs), 2)
  assert.deepEqual(Object.keys(recs[0]).sort(), ['sessionId', 'title'])
})

test('账本：追加 → 重载读回 → 未读归零', () => {
  const dir = isolate()
  const l1 = ledgerMod.createLedger({ log: { warn() {}, error() {} } })
  l1.load()
  const r = l1.append({ sessionId: 's1', title: 'A', endTime: Date.now(), duration: 5, endReason: 'completed' })
  assert.equal(r.seq, 1)
  assert.equal(l1.stats().stored, 1)
  assert.equal(l1.unread(), 1)
  l1.markRead(Date.now() + 1)
  assert.equal(l1.unread(), 0)

  const l2 = ledgerMod.createLedger({ log: { warn() {}, error() {} } })
  l2.load()
  assert.equal(l2.stats().stored, 1)
  assert.equal(l2.records()[0].title, 'A')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('账本：崩溃恢复把 open.json 里挂着的任务补成 interrupted', () => {
  const dir = isolate()
  const paths = ledgerMod.ledgerPaths()
  fs.mkdirSync(paths.dir, { recursive: true })
  fs.writeFileSync(paths.open, JSON.stringify({
    schemaVersion: 1, at: 2000,
    active: [{ sessionId: 's9', title: '挂着的', startTime: 1000, lastActivityAt: 2000 }],
  }))

  const l = ledgerMod.createLedger({ log: { warn() {}, error() {} } })
  l.load()
  const recovered = l.recoverOpen()
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0].endReason, 'interrupted')
  assert.equal(recovered[0].recovered, true)
  assert.equal(recovered[0].endTime, 2000) // 不伪造结束时刻
  fs.rmSync(dir, { recursive: true, force: true })
})

test('账本：schema 越界 → 只读降级，不丢记录、不重写文件', () => {
  const dir = isolate()
  const paths = ledgerMod.ledgerPaths()
  fs.mkdirSync(paths.dir, { recursive: true })
  const v1 = { schemaVersion: 1, sessionId: 'old', endTime: 1000, title: '旧' }
  const future = { schemaVersion: 2, sessionId: 'new', endTime: 2000, title: '未来' }
  fs.writeFileSync(paths.ledger, JSON.stringify(v1) + '\n' + JSON.stringify(future) + '\n')
  const before = fs.readFileSync(paths.ledger, 'utf8')

  const l = ledgerMod.createLedger({ log: { warn() {}, error() {} } })
  l.load()
  const s = l.stats()
  assert.equal(s.stored, 2)
  assert.equal(s.readOnly, true)
  assert.equal(s.unsupported, 1)

  l.append({ sessionId: 'x', endTime: 3000, title: '新的', duration: 1, endReason: 'completed' })
  const after = fs.readFileSync(paths.ledger, 'utf8')
  assert.equal(after, before, '只读降级期间不得改写磁盘')
  assert.equal(l.stats().stored, 3, '内存里仍然记录')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('账本：加载时清洗遗留 token 并留 .bak-tokens', () => {
  const dir = isolate()
  const paths = ledgerMod.ledgerPaths()
  fs.mkdirSync(paths.dir, { recursive: true })
  fs.writeFileSync(paths.ledger, JSON.stringify({ schemaVersion: 1, sessionId: 'a', endTime: 1000, inputTokens: 5 }) + '\n')

  const l = ledgerMod.createLedger({ log: { warn() {}, error() {} } })
  l.load()
  assert.ok(!('inputTokens' in l.records()[0]))
  assert.ok(fs.existsSync(paths.ledger + '.bak-tokens'))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('信任门：回环/同源放行，越界一律 403', () => {
  const cases = [
    [{ host: '127.0.0.1:49539' }, true],
    [{ host: 'localhost:3000' }, true],
    [{ host: '[::1]:49539' }, true],
    [{ host: '127.0.0.1:49539', origin: 'http://127.0.0.1:49539' }, true],
    [{ host: '127.0.0.1.evil.com' }, false],
    [{ host: '192.168.1.9:49539' }, false],
    [{ host: '127.0.0.1:49539', 'sec-fetch-site': 'cross-site' }, false],
    [{ host: '127.0.0.1:49539', origin: 'https://evil.example.com' }, false],
    [{ host: '127.0.0.1:49539', origin: 'http://127.0.0.1:3000' }, false],
    [{}, false],
  ]
  for (const [headers, expect] of cases) {
    let allowed = true
    try { core.assertTrustedRequest({ headers }) } catch (e) { allowed = false; assert.equal(e.statusCode, 403) }
    assert.equal(allowed, expect, JSON.stringify(headers))
  }
})

test('预设：三档字段齐全，安静不发声，看护常驻', () => {
  const ids = Object.keys(core.PRESETS)
  assert.deepEqual(ids.sort(), ['quiet', 'standard', 'watch'])
  for (const id of ids) assert.equal(Object.keys(core.PRESETS[id]).length, 8, id)
  assert.equal(core.PRESETS.quiet.soundNotify, false)
  assert.equal(core.PRESETS.quiet.notifyOnAsk, true) // 阻塞类提醒，安静档也响
  assert.equal(core.PRESETS.watch.notifyStayMs, 0)
})

test('平台符号：三处槽位与服务名就位', () => {
  assert.equal(platform.SERVICES.webServer, 'webServer')
  assert.equal(platform.CLIENT_SLOTS.capsule, 'conversation.session.header.utilities')
  assert.equal(platform.CLIENT_SLOTS.overlay, 'shell.overlay')
  assert.equal(platform.CLIENT_SLOTS.settings, 'settings.section')
  assert.equal(platform.EVENTS.sessionEvent, 'session/event')
  assert.equal(platform.checkServices({ get: () => undefined }, ['webServer']).ok, false)
  assert.equal(platform.checkServices({ get: () => ({}) }, ['webServer']).ok, true)
})
