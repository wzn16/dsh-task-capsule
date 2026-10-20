#!/usr/bin/env node
// 冒烟：模块能否加载、导出是否齐全、三处标识是否一致。
// 触发场景：删改共享模块时误删导出，浏览器半部 import 失败 → 整个插件静默消失。
// 用法：node scripts/smoke.mjs
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const need = {
  './src/host-core.js': ['CAPSULE_NS', 'PRESETS', 'PRESET_IDS', 'SOUND_EFFECTS', 'denied', 'assertTrustedRequest', 'sendJson', 'readBody'],
  './src/ledger.js': ['SCHEMA_VERSION', 'createLedger', 'ledgerPaths', 'parseLedgerLines', 'countUnread', 'makeRecordId', 'summarizeRecords'],
  './src/task-track.js': ['createTracker'],
  './features/runstate/host.js': ['setupRunstate'],
  './features/notify/host.js': ['setupNotify'],
  './features/ledger/host.js': ['setupLedger'],
  './index.js': ['name', 'inject', 'apply'],
}

let bad = 0
for (const [rel, keys] of Object.entries(need)) {
  try {
    const mod = await import('file://' + path.join(root, rel))
    const miss = keys.filter((k) => !(k in mod))
    if (miss.length) { console.error('FAIL', rel, '缺导出:', miss.join(', ')); bad++ }
    else console.log('PASS 加载', rel, '(' + keys.length + ' 个导出)')
  } catch (e) {
    console.error('FAIL 加载失败', rel, '→', e.message)
    bad++
  }
}

// 三处标识必须一致：否则 client 半部注册不上
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const clientText = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
const patch = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
const clientId = (clientText.match(/id:\s*"([^"]+)"/) || [])[1]
const patchId = (patch.match(/id:\s*([\w-]+)/) || [])[1]
for (const [label, got] of [['client.js id', clientId], ['cordis.patch.yml id', patchId], ['package.json name', pkg.name]]) {
  if (got !== pkg.name) { console.error('FAIL 标识不一致', label, '=', got, '≠', pkg.name); bad++ }
  else console.log('PASS 标识一致', label)
}

if (bad) { console.error('\n冒烟失败：' + bad + ' 项'); process.exit(1) }
console.log('\n冒烟通过')
