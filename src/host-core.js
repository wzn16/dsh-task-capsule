// dsh-task-capsule · 宿主共享内核：常量、settings schema 与 HTTP 小工具。
// 从 dsh-dock src/host-core.js 精简而来：只保留本插件三功能需要的部分
// （notify 配置段 + sendJson/readBody），去掉动画/远程访问/视觉代理等段。
import z from '@deepseek-ai/schemastery'

/** dsh-task-capsule 自有 settings 命名空间（通知行为配置持久化）。 */
export const CAPSULE_NS = 'dsh-task-capsule'

/** 通知配置字段清单（schema、迁移、客户端默认值三处共用同一份键名）。 */
export const NOTIFY_FIELDS = [
  'notifyOnComplete', 'notifyOnError', 'notifyOnConfirm', 'notifyStayMs',
  'systemNotify', 'systemNotifyAlways', 'soundNotify', 'soundEffect',
]

/** 自有命名空间 schema：只有 notify 一段（三功能常开，不做功能开关表）。 */
export const CapsuleConfig = z.object({
  // 【任务通知】行为配置：页内卡片 / 提示音 / 浏览器系统通知。
  // 键名与 dsh-dock 的 notify 段保持一致，便于首启动只读迁移旧值。
  notify: z.object({
    notifyOnComplete: z.boolean().default(true),
    notifyOnError: z.boolean().default(true),
    // 工具等待用户确认/批准时提醒（dsh 会话流 approval/asked）
    notifyOnConfirm: z.boolean().default(true),
    // 通知停留毫秒数（0 = 常驻直到手动关闭）
    notifyStayMs: z.number().default(8000),
    // 浏览器系统通知（默认仅页面后台时推送）
    systemNotify: z.boolean().default(false),
    // 前台也推系统通知（开启后不再限制页面后台；Electron 客户端内为系统级通知）
    systemNotifyAlways: z.boolean().default(false),
    // 任务结束提示音（WebAudio 合成，无音频文件依赖）
    soundNotify: z.boolean().default(true),
    // 提示音音效（完成场景音名；异常音由音效包内配套）
    soundEffect: z.string().default('chime'),
    // 一次性迁移标记：已从 dsh-dock 的 notify 段只读拷贝过旧值
    migratedFromDock: z.boolean().default(false),
  }).default({}),
})

/** 提示音 soundEffect 合法值（客户端音效库键名；精简版只保留两种）。 */
export const SOUND_EFFECTS = ['chime', 'ding']

/**
 * 请求信任门。
 * 宿主只对 /api 与首页做了 Host/Origin/Sec-Fetch-Site 校验，webServer 的 prefix 路由命中即派发，
 * 所以插件自己的路由必须自己守：非本机 Host、跨源 Origin、cross-site 一律 403。
 */
const LOOPBACK_HOST = /^(127(?:\.\d{1,3}){3}|localhost|\[::1\])(:\d{1,5})?$/i
const LOOPBACK_ORIGIN = /^https?:\/\/(127(?:\.\d{1,3}){3}|localhost|\[::1\])(:\d{1,5})?$/i

/** 构造带 HTTP 状态码的错误。 */
export function denied(status, message) {
  const e = new Error(message)
  e.statusCode = status
  return e
}

/** 不是本机同源来的请求直接拒——在 readBody 之前调用。 */
export function assertTrustedRequest(req) {
  const headers = (req && req.headers) || {}
  const host = String(headers.host || '')
  const origin = headers.origin
  const site = String(headers['sec-fetch-site'] || '')
  if (site === 'cross-site') throw denied(403, '跨站请求被拒绝')
  if (!LOOPBACK_HOST.test(host)) throw denied(403, '非本机 Host 被拒绝')
  // Origin 必须与本请求 authority 完全一致：只认回环网段会放行同机其它端口的页面
  if (origin) {
    if (!LOOPBACK_ORIGIN.test(origin)) throw denied(403, '跨源请求被拒绝')
    let authority = ''
    try { authority = new URL(origin).host } catch { throw denied(403, '跨源请求被拒绝') }
    if (authority !== host) throw denied(403, '跨源请求被拒绝')
  }
}

/**
 * 一次性只读迁移：从 dsh-dock 的 notify 段拷贝用户旧配置到本插件命名空间。
 * 只写 dsh-task-capsule 自己的段，绝不写回 dsh-dock；dsh-dock 未安装/无旧值时静默跳过。
 */
export async function migrateNotifyFromDock(ctx) {
  try {
    const settings = ctx.get('settings')
    if (!settings || typeof settings.get !== 'function' || typeof settings.mutate !== 'function') return
    const mine = settings.get(CAPSULE_NS)
    const myNotify = mine && typeof mine === 'object' && mine.notify && typeof mine.notify === 'object' ? mine.notify : null
    if (myNotify && myNotify.migratedFromDock === true) return
    const dock = settings.get('dsh-dock')
    const legacy = dock && typeof dock === 'object' && dock.notify && typeof dock.notify === 'object' ? dock.notify : null
    if (!legacy) return
    const copied = {}
    let n = 0
    for (const key of NOTIFY_FIELDS) {
      if (legacy[key] !== undefined) { copied[key] = legacy[key]; n++ }
    }
    if (n === 0) return
    const next = Object.assign({}, myNotify || {}, copied, { migratedFromDock: true })
    await settings.mutate(CAPSULE_NS, [{ op: 'set', path: ['notify'], value: next }])
    console.log('[dsh-task-capsule] notify config migrated (read-only) from dsh-dock; fields copied:', n)
  } catch (e) {
    console.warn('[dsh-task-capsule] notify migration from dsh-dock skipped:', (e && e.message) || String(e))
  }
}

/** 序列化 JSON 响应。 */
export function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/** 解析 POST 请求体 JSON（限长 2MB）。 */
export function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 2 * 1024 * 1024) {
        const err = new Error('请求体过大')
        err.statusCode = 400 // 客户端错误，别报成 500
        reject(err)
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (e) {
        const err = new Error('请求体不是合法 JSON')
        err.statusCode = 400
        reject(err)
      }
    })
    req.on('error', reject)
  })
}
