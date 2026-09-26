// dsh-task-capsule · 功能【任务通知】· 宿主半部
// 职责：通知配置持久化 + 下发快照（页内卡片/提示音/系统通知在浏览器半部）。
// 与 dsh-dock 的差异：不做钉钉/飞书群机器人推送（v1 精简掉，需要时再加）。
//
// RPC（webServer HTTP 路由，前缀 /dsh-task-capsule/notify/）：
//   POST /status —— 活跃任务 + 最近完成 + 通知配置（客户端据此弹卡片、响提示音）
//   POST /config —— 增量更新通知配置字段并持久化到插件自有 JSON（官方壳下 settings 门面拒绝写入）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { CAPSULE_NS, SOUND_EFFECTS, sendJson, readBody } from '../../src/host-core.js'

// 默认配置（与 schema 默认值一致；settings.get 未挂载时的兜底）
function defaultConfig() {
  return {
    notifyOnComplete: true,
    notifyOnError: true,
    notifyOnConfirm: true,
    notifyStayMs: 8000,
    systemNotify: false,
    systemNotifyAlways: false,
    soundNotify: true,
    soundEffect: 'chime',
    migratedFromDock: false,
  }
}

// 自有配置文件持久化（2026-09-26 适配官方壳：settings 门面拒绝未声明条目写入，
// 改为插件自有 JSON，与 harness API 漂移解耦；settings 仅作旧值一次性回退读取）
const NOTIFY_FILE = path.join(
  process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
  'dsh-task-capsule.notify.json',
)

function loadOwnConfig() {
  try {
    const v = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8'))
    return v && typeof v === 'object' && v.notify && typeof v.notify === 'object' ? v.notify : null
  } catch { return null }
}

function saveOwnConfig(notify) {
  const tmp = NOTIFY_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ notify }, null, 2))
  fs.renameSync(tmp, NOTIFY_FILE)
}

// 读 notify 配置：自有文件优先；文件不存在时回退 settings 旧值；再不行用默认
function readConfig(ctx) {
  const cfg = defaultConfig()
  try {
    let n = loadOwnConfig()
    if (!n) {
      const settings = ctx.get('settings')
      const v = settings && typeof settings.get === 'function' ? settings.get(CAPSULE_NS) : null
      n = v && typeof v === 'object' && v.notify && typeof v.notify === 'object' ? v.notify : null
    }
    if (n) {
      for (const key of Object.keys(cfg)) {
        if (n[key] !== undefined) cfg[key] = n[key]
      }
      if (!SOUND_EFFECTS.includes(cfg.soundEffect)) cfg.soundEffect = 'chime'
    }
  } catch { /* 读取失败，用默认 */ }
  return cfg
}

export function setupNotify(ctx, tracker) {
  const disposers = []
  const dispose = () => {
    while (disposers.length > 0) {
      const fn = disposers.pop()
      try { if (typeof fn === 'function') fn() } catch { /* 停用清理失败不阻断 */ }
    }
  }

  // tracker 在本插件内只此一份实例（index.js 创建），通知不需要额外订阅。
  void tracker

  disposers.push(ctx.inject(['webServer'], (wsCtx) => {
    wsCtx.effect(() => wsCtx.webServer.register({
      kind: 'prefix',
      path: '/dsh-task-capsule/notify',
      async handler(req, res) {
        try {
          const url = new URL(req.url || '/', 'http://dsh.internal')
          const method = url.pathname.replace(/^\/dsh-task-capsule\/notify\/?/, '').split('/')[0] || ''
          const payload = await readBody(req)

          if (method === 'status') {
            return sendJson(res, 200, {
              ok: true,
              data: Object.assign({}, tracker.snapshot(Date.now()), { config: readConfig(ctx) }),
            })
          }

          if (method === 'config') {
            // 增量合并：只接受已知字段，类型不符忽略；整体写回 notify 段
            const cfg = readConfig(ctx)
            const p = payload || {}
            if (typeof p.notifyOnComplete === 'boolean') cfg.notifyOnComplete = p.notifyOnComplete
            if (typeof p.notifyOnError === 'boolean') cfg.notifyOnError = p.notifyOnError
            if (typeof p.notifyOnConfirm === 'boolean') cfg.notifyOnConfirm = p.notifyOnConfirm
            if (typeof p.notifyStayMs === 'number' && Number.isFinite(p.notifyStayMs)) {
              cfg.notifyStayMs = Math.max(0, Math.min(600000, Math.round(p.notifyStayMs)))
            }
            if (typeof p.systemNotify === 'boolean') cfg.systemNotify = p.systemNotify
            if (typeof p.systemNotifyAlways === 'boolean') cfg.systemNotifyAlways = p.systemNotifyAlways
            if (typeof p.soundNotify === 'boolean') cfg.soundNotify = p.soundNotify
            if (typeof p.soundEffect === 'string' && SOUND_EFFECTS.includes(p.soundEffect)) cfg.soundEffect = p.soundEffect

            try {
              saveOwnConfig(cfg)
            } catch (e) {
              const err = new Error('保存配置失败：' + ((e && e.message) || String(e)))
              err.statusCode = 500
              throw err
            }
            console.log('[dsh-task-capsule] notify config saved (own file)')
            return sendJson(res, 200, { ok: true, data: { config: cfg, savedAt: Date.now() } })
          }

          return sendJson(res, 404, { ok: false, error: { code: 'method-not-found', message: 'unknown method: ' + method } })
        } catch (e) {
          const status = e && e.statusCode ? e.statusCode : 500
          console.error('[dsh-task-capsule] notify HTTP error:', status, e && e.message)
          return sendJson(res, status, {
            ok: false,
            error: { code: status >= 500 ? 'internal' : 'bad-request', message: (e && e.message) || String(e) },
          })
        }
      },
    }), 'dsh-task-capsule notify: /dsh-task-capsule/notify HTTP route')
  }))

  return dispose
}
