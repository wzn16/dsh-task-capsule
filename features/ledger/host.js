// dsh-task-capsule · 功能【任务账本】· 宿主半部
// 只读：账本区间查询（今日汇总、列表、详情、对账），前缀 /dsh-task-capsule/ledger
import { sendJson, readBody, assertTrustedRequest } from '../../src/host-core.js'

export function setupLedger(ctx, tracker) {
  return ctx.inject(['webServer'], (wsCtx) => {
    wsCtx.effect(() => wsCtx.webServer.register({
      kind: 'prefix',
      path: '/dsh-task-capsule/ledger',
      async handler(req, res) {
        try {
          assertTrustedRequest(req) // 先过信任门，再读任何内容
          const url = new URL(req.url || '/', 'http://dsh.internal')
          const method = url.pathname.replace(/^\/dsh-task-capsule\/ledger\/?/, '').split('/')[0] || ''
          const payload = await readBody(req)

          if (method === 'query') {
            return sendJson(res, 200, { ok: true, data: tracker.ledgerQuery(payload) })
          }

          return sendJson(res, 404, { ok: false, error: { code: 'method-not-found', message: 'unknown method: ' + method } })
        } catch (e) {
          const status = e && e.statusCode ? e.statusCode : 500
          console.error('[dsh-task-capsule] ledger HTTP error:', status, e && e.message)
          return sendJson(res, status, {
            ok: false,
            error: { code: status >= 500 ? 'internal' : 'bad-request', message: status >= 500 ? 'internal error' : ((e && e.message) || String(e)) },
          })
        }
      },
    }), 'dsh-task-capsule ledger: /dsh-task-capsule/ledger HTTP route')
  })
}
