#!/usr/bin/env node
// 把 locale/*.json 落成 client.js 里的 MESSAGES 字面量。
//
// 运行时没有构建链：bundle 里内联的就是字典本身，这里只是让维护者能按 JSON 改词条，
// 再把它同步回那一段（`/* locale-messages:start *​/` 与 `end` 之间）。
//
//   node scripts/gen-locale.mjs          写入
//   node scripts/gen-locale.mjs --check  只校验是否已经同步（CI/提交前用）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCALES = ['zh', 'en', 'pt']
const START = '/* locale-messages:start */'
const END = '/* locale-messages:end */'
const CLIENT = path.join(ROOT, 'client.js')

function readLocales() {
  const dicts = {}
  for (const id of LOCALES) {
    const file = path.join(ROOT, 'locale', id + '.json')
    dicts[id] = JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  // 三份必须键集一致：缺一条就回落到 zh，但那是运行时的兜底，不是允许漏翻的理由
  const base = Object.keys(dicts.zh).sort()
  for (const id of LOCALES.slice(1)) {
    const keys = Object.keys(dicts[id]).sort()
    const missing = base.filter((k) => !(k in dicts[id]))
    const extra = keys.filter((k) => !(k in dicts.zh))
    if (missing.length || extra.length) {
      throw new Error('locale/' + id + '.json 键集与 zh 不一致（缺 ' + missing.length + '，多 ' + extra.length + '）')
    }
  }
  return dicts
}

function render(dicts) {
  const body = {}
  for (const id of LOCALES) {
    const sorted = {}
    for (const k of Object.keys(dicts[id]).sort()) sorted[k] = dicts[id][k]
    body[id] = sorted
  }
  const json = JSON.stringify(body, null, '\t')
  const indented = json.split('\n').map((l) => (l ? '\t\t' + l : l)).join('\n')
  const head = '\t\t/* locale-messages:start */\n\t\tvar MESSAGES = '
  const tail = ';\n\t\t/* locale-messages:end */'
  return head + indented.trimStart() + tail
}

const dicts = readLocales()
const block = render(dicts)
const src = fs.readFileSync(CLIENT, 'utf8')

const start = (() => {
  let i = src.indexOf(START)
  // 连同块前的缩进一起吃掉，否则每跑一次就多缩一层
  while (i > 0 && (src[i - 1] === '\t' || src[i - 1] === ' ')) i--
  return i
})()
const end = src.indexOf(END)
if (start < 0 || end < 0 || end < start) throw new Error('client.js 缺少 locale-messages 标记')

// 块内统一用文件本身的换行风格（本仓库是 CRLF）
const eol = src.includes('\r\n') ? '\r\n' : '\n'
const blockWithEol = block.replace(/\n/g, eol)

const before = src.slice(0, start)
const after = src.slice(end + END.length)
const next = before + blockWithEol + after

if (process.argv.includes('--check')) {
  if (next !== src) {
    console.error('client.js 的 MESSAGES 与 locale/*.json 不同步，请运行 node scripts/gen-locale.mjs')
    process.exit(1)
  }
  console.log('locale ok (' + Object.keys(dicts.zh).length + ' keys × ' + LOCALES.length + ' locales)')
} else {
  fs.writeFileSync(CLIENT, next, 'utf8')
  console.log('client.js 已同步 (' + Object.keys(dicts.zh).length + ' keys × ' + LOCALES.length + ' locales)')
}
