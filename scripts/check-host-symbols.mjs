#!/usr/bin/env node
// 升级 DSH 之后跑这个：核对 src/platform.js 里的平台符号是否还存在于宿主里。
//
// 插件赖以生效的只有三类字符串——服务名、事件名、客户端插槽名。宿主改了其中任何一个，
// 表现都是「插件还在，但胶囊静默消失」，日志不报错。与其等用户反馈，不如升级后主动校验。
//
//   node scripts/check-host-symbols.mjs                  # 自动找本机安装的 DSH
//   node scripts/check-host-symbols.mjs --asar <path>    # 指定 app.asar
//   node scripts/check-host-symbols.mjs --dir <path>     # 指定源码目录（只扫 .js，跳过 node_modules）
//
// 退出码：0 全部命中；1 有缺失（说明该适配新版本了）。
import fs from 'node:fs'
import path from 'node:path'
import { SERVICES, EVENTS, CLIENT_SLOTS } from '../src/platform.js'

const WANT = [
  ...Object.values(SERVICES).map((v) => ({ kind: '服务', value: v })),
  ...Object.values(EVENTS).map((v) => ({ kind: '事件', value: v })),
  ...Object.values(CLIENT_SLOTS).map((v) => ({ kind: '插槽', value: v })),
]

const DEFAULT_ASAR = [
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
].find((p) => fs.existsSync(p))

function argOf(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** 读 asar，返回 [{ path, data }]——只取可能含符号的文本文件 */
function readAsar(file) {
  const fd = fs.openSync(file, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  const jsonLen = head.readUInt32LE(12)
  const headerBuf = Buffer.alloc(jsonLen)
  fs.readSync(fd, headerBuf, 0, jsonLen, 16)
  const header = JSON.parse(headerBuf.toString('utf8'))
  const base = 16 + jsonLen

  const out = []
  const walk = (node, prefix) => {
    for (const [name, meta] of Object.entries(node.files ?? {})) {
      const p = prefix + '/' + name
      if (!meta || typeof meta !== 'object') continue
      if (meta.files) walk(meta, p)
      else if (meta.offset !== undefined) {
        // 本机 asar 把 offset/size 存成字符串，必须转数字
        const off = Number(meta.offset)
        const size = Number(meta.size)
        if (!Number.isFinite(off) || !Number.isFinite(size)) continue
        if (size <= 0 || size >= 8 * 1024 * 1024 || !/\.(js|json)$/.test(p)) continue
        const buf = Buffer.alloc(size)
        fs.readSync(fd, buf, 0, size, base + off)
        out.push({ path: p, data: buf })
      }
    }
  }
  walk(header, '')
  fs.closeSync(fd)
  return out
}

function readDir(root) {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|json)$/.test(e.name)) {
        const st = fs.statSync(p)
        if (st.size > 0 && st.size < 8 * 1024 * 1024) out.push({ path: p, data: fs.readFileSync(p) })
      }
    }
  }
  walk(root)
  return out
}

function hostVersion(asarPath) {
  try {
    const rt = path.join(path.dirname(asarPath), 'runtime', 'primary-runtime', 'runtime.json')
    return JSON.parse(fs.readFileSync(rt, 'utf8')).desktopVersion
  } catch { return '未知版本' }
}

const asarArg = argOf('--asar')
const dirArg = argOf('--dir')
const asar = asarArg ?? DEFAULT_ASAR
if (!dirArg && !asar) {
  console.error('找不到本机 DSH 安装：用 --asar <app.asar> 或 --dir <源码目录> 指定')
  process.exit(2)
}

const files = dirArg ? readDir(dirArg) : readAsar(asar)
console.log('宿主：' + (dirArg ? dirArg : asar + '（' + hostVersion(asar) + '）'))
console.log('扫描 ' + files.length + ' 个文件，核对 ' + WANT.length + ' 个平台符号\n')

let bad = 0
for (const { kind, value } of WANT) {
  const hit = files.find((f) => f.data.includes(value))
  if (hit) {
    console.log('PASS ' + kind + ' ' + value)
  } else {
    console.log('FAIL ' + kind + ' ' + value + ' —— 宿主里找不到，需要适配')
    bad++
  }
}

if (bad) {
  console.log('\n' + bad + ' 个符号缺失。对照宿主源码更新 src/platform.js，再跑一次完整自查。')
  process.exit(1)
}
console.log('\n平台符号全部命中')
