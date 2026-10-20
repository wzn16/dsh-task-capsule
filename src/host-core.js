// dsh-task-capsule · 宿主共享内核：常量、settings schema 与 HTTP 小工具。
// 从 dsh-dock src/host-core.js 精简而来：只保留本插件三功能需要的部分
// （notify 配置段 + sendJson/readBody），去掉动画/远程访问/视觉代理等段。
/** 三档提醒预设：都是既有 8 个字段的组合，不引入新概念。 */
export const PRESETS = {
  // 只有工具在等你确认时才吵；完成/出错只记未读
  quiet: {
    notifyOnComplete: false, notifyOnError: false, notifyOnConfirm: true,
    soundNotify: false, systemNotify: false, systemNotifyAlways: false, notifyStayMs: 5000,
  },
  // 离开窗口时提醒一次；正看着屏幕时不打扰
  standard: {
    notifyOnComplete: true, notifyOnError: true, notifyOnConfirm: true,
    soundNotify: true, systemNotify: true, systemNotifyAlways: false, notifyStayMs: 8000,
  },
  // 全都要：系统通知常开，卡片常驻到手动关闭
  watch: {
    notifyOnComplete: true, notifyOnError: true, notifyOnConfirm: true,
    soundNotify: true, systemNotify: true, systemNotifyAlways: true, notifyStayMs: 0,
  },
}

export const PRESET_IDS = Object.keys(PRESETS)

/** dsh-task-capsule 自有 settings 命名空间（只作旧值一次性读取，不再注册）。 */
export const CAPSULE_NS = 'dsh-task-capsule'

/** 提示音 soundEffect 合法值（客户端音效库键名）。 */
export const SOUND_EFFECTS = ['chime', 'ding']

/**
 * 请求信任门。
 * 宿主只对 /api 与首页做 Host/Origin/Sec-Fetch-Site 校验，webServer 的 prefix 路由命中即派发，
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
