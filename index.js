// dsh-task-capsule · Host 半部（Node 侧入口）
//
// 从 dsh-dock 提取的精简插件（两功能）：
//   - runstate  会话 header 任务胶囊的数据源（只读快照路由）
//   - notify    任务通知配置持久化 + 快照路由（页内卡片/提示音/系统通知在浏览器半部）
// 两功能常开、无开关表；共享一份会话追踪实例（src/task-track.js）。
// 不含 tokenlog：DSH 自带会话统计条已覆盖 token/缓存命中统计（用户 2026-09-17 裁决）。
import { CAPSULE_NS, CapsuleConfig, migrateNotifyFromDock } from './src/host-core.js'
import { createTracker } from './src/task-track.js'
import { setupRunstate } from './features/runstate/host.js'
import { setupNotify } from './features/notify/host.js'

export const name = 'dsh-task-capsule'

// 硬依赖 webServer（路由注册）+ settings（自有命名空间读写）。
export const inject = ['webServer', 'settings']

export function apply(ctx) {
  const disposers = []

  // 自有 settings 命名空间（dsh-task-capsule）：通知行为配置持久化；
  // 注册完成后从 dsh-dock 的 notify 段只读迁移一次旧值（不写回 dsh-dock）。
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register(CAPSULE_NS, CapsuleConfig, {})
    migrateNotifyFromDock(sctx)
  })

  // 会话级任务追踪：本插件内唯一实例，胶囊与通知共用；卸载时退订。
  const tracker = createTracker(ctx)
  disposers.push(() => tracker.dispose())

  // 两个功能的宿主半部（各自注册 HTTP 路由，返回 disposer）
  disposers.push(setupRunstate(ctx, tracker))
  disposers.push(setupNotify(ctx, tracker))

  console.log('[dsh-task-capsule] host half loaded; features: runstate, notify')

  // 插件卸载/更新时兜底清理
  ctx.effect(() => () => {
    while (disposers.length > 0) {
      const fn = disposers.pop()
      try { if (typeof fn === 'function') fn() } catch { /* ignore */ }
    }
  })
}
