// dsh-pilot · 功能【运行状态胶囊】· 宿主半部
// 只读：把会话级任务追踪快照下发给客户端胶囊（/dsh-pilot/runstate/status）。
import { sendJson, readBody } from '../../src/host-core.js'

export function setupRunstate(ctx, tracker) {
  return ctx.inject(['webServer'], (wsCtx) => {
    wsCtx.effect(() => wsCtx.webServer.register({
      kind: 'prefix',
      path: '/dsh-pilot/runstate',
      async handler(req, res) {
        try {
          const url = new URL(req.url || '/', 'http://dsh.internal')
          const method = url.pathname.replace(/^\/dsh-pilot\/runstate\/?/, '').split('/')[0] || ''
          await readBody(req) // 读空请求体，避免连接上残留未消费数据
          if (method === 'status') {
            return sendJson(res, 200, { ok: true, data: tracker.snapshot(Date.now()) })
          }
          return sendJson(res, 404, { ok: false, error: { code: 'method-not-found', message: 'unknown method: ' + method } })
        } catch (e) {
          const status = e && e.statusCode ? e.statusCode : 500
          console.error('[dsh-pilot] runstate HTTP error:', status, e && e.message)
          return sendJson(res, status, {
            ok: false,
            error: { code: status >= 500 ? 'internal' : 'bad-request', message: (e && e.message) || String(e) },
          })
        }
      },
    }), 'dsh-pilot runstate: /dsh-pilot/runstate HTTP route')
  })
}
