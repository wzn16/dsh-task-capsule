// dsh-task-capsule · 平台符号集中地（v1.0.0 冻结）。
// 宿主依赖的所有"约定字符串"都在这里：服务名、事件名、客户端槽位名。
// 宿主升级后插件失灵时，先对照宿主源码核对这份清单——改这里，不要到处找字符串。
export const SERVICES = {
  webServer: 'webServer',
}

export const EVENTS = {
  sessionEvent: 'session/event',
  agentStatus: 'agent/status',
  agentDisposed: 'agent/disposed',
}

export const CLIENT_SLOTS = {
  capsule: 'conversation.session.header.utilities',
  overlay: 'shell.overlay',
  settings: 'settings.section',
}

/** 启动自检：缺哪个服务一目了然。返回 { ok, missing[] }。 */
export function checkServices(ctx, required) {
  const missing = []
  for (const name of required) {
    if (ctx.get && typeof ctx.get === 'function') {
      if (ctx.get(name) === undefined) missing.push(name)
    }
  }
  return { ok: missing.length === 0, missing }
}
