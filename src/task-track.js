// dsh-task-capsule · 宿主共享内核：会话级任务追踪（胶囊/通知共用一份数据）。
// 从 dsh-dock src/task-track.js 精简移植：去掉动画专用字段（motionTicks/lastMotionAt），
// 保留阶段推导、等待确认（approvals）、token 累计、会话标题与结束归档。
//
// 用法（index.js）：
//   const tracker = createTracker(ctx)
//   tracker.snapshot(Date.now())            // → { now, active: [...], recent: [...] }
//   const off = tracker.onFinish((rec) => {}) // 任务结束回调
//   tracker.dispose()                        // 退订会话事件

import { createLedger, summarizeRecords } from './ledger.js'
import { EVENTS } from './platform.js'

/** 内存里最近完成记录保留条数（新→旧）；持久层另有 1000 条上限。 */
const MAX_COMPLETED = 30

export function createTracker(ctx) {
  const activeSessions = new Map() // sessionId -> 追踪记录
  const completedSessions = [] // 最近完成（新→旧）
  const finishListeners = new Set()
  const disposers = []

  // 账本：收尾记录落盘，重启后仍能看到历史与未读；顺带把崩溃前挂着的任务补成 interrupted
  const ledger = createLedger({ log: console })
  try {
    ledger.load()
    const recovered = ledger.recoverOpen()
    if (recovered.length > 0) {
      for (const r of recovered.slice().reverse()) completedSessions.unshift(r)
      console.log('[dsh-task-capsule] recovered', recovered.length, 'interrupted task(s) from open.json')
    }
  } catch (e) {
    console.error('[dsh-task-capsule] ledger load failed:', (e && e.message) || String(e))
  }

  function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0 }

  function extractText(content) {
    if (!Array.isArray(content)) return ''
    const parts = []
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }

  function truncate(str, max = 160) {
    if (!str) return ''
    return String(str).length > max ? String(str).slice(0, max) + '…' : str
  }

  // 工具名 → 阶段：检索类工具 = search，其余 = code
  function phaseOfToolName(name) {
    const n = String(name || '').toLowerCase()
    if (/web|search|fetch|grep|glob|find|read|ls$|^ls|tree|locate/.test(n)) return 'search'
    return 'code'
  }

  // 会话标题：官方标题服务，取不到回退首条用户输入（firstPrompt）
  async function getSessionTitle(sessionId, sessionQuery) {
    try {
      if (!sessionQuery) return ''
      if (typeof sessionQuery.readTitle === 'function') {
        const snap = await sessionQuery.readTitle(sessionId)
        if (snap && snap.title) return snap.title
      }
      if (typeof sessionQuery.readSession === 'function') {
        const snap = await sessionQuery.readSession(sessionId)
        if (snap && snap.header && snap.header.title) return snap.header.title
      }
    } catch { /* 标题取不到就用 firstPrompt 兜底 */ }
    return ''
  }

  function addActiveSession(sid, sessionQuery, extra = {}) {
    if (activeSessions.has(sid)) return activeSessions.get(sid)
    const record = {
      startTime: Date.now(),
      title: '',
      turns: 0,
      steps: 0,
      toolCalls: 0,
      models: new Set(),
      provider: '',
      endReason: '',
      errorMessage: '',
      firstPrompt: '',
      // 工具等待用户确认（dsh 会话流 approval/asked）：浏览器侧据此弹"需确认"通知
      approvals: new Map(), // approvalId -> { toolName, reason, askedAt }
      questions: new Map(), // ask_user_question 等待用户选择：qid -> { title, question, askedAt }
      approvalLog: [], // 已决审批：{ id, toolName, askedAt, decidedAt, waitMs }
      phase: 'think',
      phaseAt: Date.now(),
      lastActivityAt: Date.now(),
      ...extra,
    }
    activeSessions.set(sid, record)
    getSessionTitle(sid, sessionQuery).then((title) => {
      const s = activeSessions.get(sid)
      if (s) s.title = title
    })
    return record
  }

  // 任务结束：归档 + 通知订阅者（浏览器侧通知由消费方决定怎么用）
  function finishSession(sid) {
    const session = activeSessions.get(sid)
    if (!session) return
    activeSessions.delete(sid)
    const endTime = Date.now()
    const duration = endTime - session.startTime
    const record = {
      sessionId: sid,
      title: session.title || truncate(session.firstPrompt, 60) || '(无标题)',
      duration,
      turns: session.turns,
      steps: session.steps,
      toolCalls: session.toolCalls,
      models: [...session.models],
      provider: session.provider,
      endReason: session.endReason,
      errorMessage: session.errorMessage,
      // 助手正文不下发：浏览器侧零引用，留着等于每次轮询都把原文发一遍
      approvals: session.approvalLog.slice(),
      approvalCount: session.approvalLog.length,
      approvalWaitMs: session.approvalLog.reduce((sum, a) => sum + (Number(a.waitMs) || 0), 0),
      startTime: session.startTime,
      endTime,
    }
    // 落盘优先：先写账本再广播，浏览器刷新/重启也能看到这条
    const saved = ledger.append(record)
    completedSessions.unshift(saved)
    if (completedSessions.length > MAX_COMPLETED) completedSessions.pop()
    for (const fn of finishListeners) {
      try { fn(record) } catch (e) {
        console.error('[dsh-task-capsule] task-track finish listener error:', e && e.message)
      }
    }
  }

  function handleSessionEvent(sessionQuery, session, event) {
    const sid = typeof session === 'object' && session ? (session.id || '') : String(session || '')
    if (!sid || !event || !event.type) return

    if (event.type === 'step/start') {
      const s = addActiveSession(sid, sessionQuery, { startTime: event.time || Date.now() })
      s.steps++
      s.phase = 'think' // 新步骤：模型正在推理下一步
      s.phaseAt = event.time || Date.now()
      s.lastActivityAt = s.phaseAt
      if (event.data && event.data.turn !== undefined) {
        s.turns = Math.max(s.turns, num(event.data.turn) + 1)
      }
      return
    }
    const s = activeSessions.get(sid)
    if (!s) return
    const now = event.time || Date.now()
    // 流级阶段：chunk 高频到达（每 token 一条），只做最廉价的阶段切换
    if (event.type === 'assistant/chunk') {
      const chunk = event.data && event.data.chunk
      const ctype = chunk && chunk.type
      if (ctype === 'reasoning-delta') {
        s.phase = 'think'
        s.phaseAt = now
      } else if (ctype === 'text-delta') {
        s.phase = 'write'
        s.phaseAt = now
      }
      s.lastActivityAt = now
      return
    }
    if (event.type === 'turn/end' && s.questions.size > 0) {
      // 回合都结束了还挂着的提问必是残留——这条不依赖 reason 字段
      s.questions.clear()
    }
    if (event.type === 'turn/end' && event.data && event.data.reason) {
      const reason = event.data.reason
      // 只有明确的 kind 才采信：空 kind 曾被兜成 completed，等于把未知当成功
      s.endReason = (typeof reason.kind === 'string' && reason.kind) ? reason.kind : 'unknown'
      if (reason.kind === 'error' && reason.error) {
        const msg = (reason.error && (reason.error.message || reason.error.code)) || ''
        s.errorMessage = typeof msg === 'string' ? msg : String(msg)
      }
      // 回合都结束了还挂着的提问必是残留
      if (s.questions.size > 0) s.questions.clear()
    } else if (event.type === 'approval/asked' && event.data) {
      // 工具等待用户确认/批准：挂在会话记录上，/status 下发给浏览器弹"需确认"通知
      const id = typeof event.data.id === 'string' ? event.data.id : ''
      if (id) {
        s.approvals.set(id, {
          toolName: typeof event.data.toolName === 'string' ? event.data.toolName : '',
          reason: typeof event.data.reason === 'string' ? truncate(event.data.reason, 200) : '',
          askedAt: event.time || Date.now(),
        })
      }
      s.lastActivityAt = now
    } else if (event.type === 'approval/decided' && event.data) {
      const aid = typeof event.data.id === 'string' ? event.data.id : ''
      const pend = s.approvals.get(aid)
      if (pend) {
        // 审批等待时长：原生不记这个账，只有持续记录才拿得到
        pend.decidedAt = now
        pend.waitMs = Math.max(0, now - (pend.askedAt || now))
        s.approvalLog.push({ id: aid, toolName: pend.toolName, askedAt: pend.askedAt, decidedAt: pend.decidedAt, waitMs: pend.waitMs })
        if (s.approvalLog.length > 20) s.approvalLog.shift()
      }
      s.approvals.delete(aid)
    } else if (event.type === 'tool/call') {
      s.toolCalls++
      s.phase = phaseOfToolName(event.data && event.data.name)
      s.phaseAt = now
      // 选项选择会停住整个回合等你拍板：与审批一样属于"有东西等你"，只是入口不同。
      // 载荷事实（issue #1 贡献者实测）：id 字段叫 callId；arguments 是 JSON 字符串，
      // 形如 {questions:[{header, question, options:[]}]}。解析失败只影响摘要，不影响等待态判定。
      const d = event.data || {}
      if (String(d.name || '').toLowerCase() === 'ask_user_question') {
        if (!(typeof d.callId === 'string' && d.callId)) return // 没有 callId 就对不上 tool/result，不记
        const qid = d.callId
        let info = { count: 0, header: '', text: '', optionCount: 0 }
        try {
          const parsed = typeof d.arguments === 'string' ? JSON.parse(d.arguments) : (d.arguments || null)
          const list = parsed && Array.isArray(parsed.questions) ? parsed.questions : []
          const first = list.length > 0 ? list[0] : null
          info = {
            count: list.length,
            header: first && typeof first.header === 'string' ? truncate(first.header, 60) : '',
            text: first && typeof first.question === 'string' ? truncate(first.question, 200) : '',
            optionCount: first && Array.isArray(first.options) ? first.options.length : 0,
          }
        } catch { /* arguments 不是合法 JSON：仍然记等待，只是摘要为空 */ }
        s.questions.set(qid, {
          askedAt: now,
          count: info.count,
          header: info.header,
          text: info.text,
          optionCount: info.optionCount,
        })
      }
    } else if (event.type === 'tool/result' && event.data) {
      // 载荷是嵌套的：data.message.source.callId（宿主 appendToolResult 里构造），顶层没有 id
      const src = (event.data.message && event.data.message.source) || {}
      const rid = (typeof src.callId === 'string' && src.callId)
        || (typeof event.data.callId === 'string' && event.data.callId)
        || ''
      if (rid) s.questions.delete(rid)
    } else if (event.type === 'user/message') {
      if (!s.firstPrompt && event.data && event.data.content) {
        const text = extractText(event.data.content)
        if (text) s.firstPrompt = text
      }
    } else if (event.type === 'assistant/message' && event.data) {
      // token 由 DSH 自带会话统计条负责，本插件不采集、不落盘、不下发
      // 助手正文不再留存：账本只记计数与结束原因，正文既不落盘也不下发
    } else if (event.type === 'request/context' && event.data) {
      if (event.data.provider) s.provider = event.data.provider
      if (event.data.model) s.models.add(event.data.model)
    } else if (event.type === 'request/header' && event.data && event.data.header && event.data.header.config) {
      const c = event.data.header.config
      if (c.provider) s.provider = c.provider
      if (c.model) s.models.add(c.model)
    }
    if (event.type !== 'request/header' && event.type !== 'request/context') s.lastActivityAt = now
  }

  function handleAgentStatus(sessionQuery, agent, status) {
    const sid = agent && agent.id ? String(agent.id) : ''
    if (!sid) return
    if (status === 'running') {
      const record = addActiveSession(sid, sessionQuery)
      if (agent.options) {
        if (agent.options.model) record.models.add(agent.options.model)
        if (agent.options.provider) record.provider = agent.options.provider
      }
    } else if (status === 'idle') {
      // 异常路径收尾时没有 endReason：标 unknown，避免被客户端当成成功
      const rec = activeSessions.get(sid)
      if (rec && !rec.endReason) rec.endReason = 'unknown'
      finishSession(sid)
    }
  }

  // 不能在 setup 时软获取 sessionQuery（可能早于服务激活），用 inject 等就绪
  disposers.push(ctx.inject(['sessionQuery'], (sqCtx) => {
    const sessionQuery = sqCtx.sessionQuery
    disposers.push(sqCtx.on(EVENTS.sessionEvent, (session, event) => {
      try {
        handleSessionEvent(sessionQuery, session, event)
      } catch (err) {
        console.error('[dsh-task-capsule] task-track handle event error', err)
      }
    }))
    disposers.push(sqCtx.on(EVENTS.agentStatus, (payload) => {
      try {
        handleAgentStatus(sessionQuery, payload && payload.agent, payload && payload.status)
      } catch (err) {
        console.error('[dsh-task-capsule] task-track handle agent/status error', err)
      }
    }))
    // agent 销毁兜底归档（会话直接关闭时也产出完成记录）
    disposers.push(sqCtx.on(EVENTS.agentDisposed, (payload) => {
      try {
        const sid = payload && payload.agent && payload.agent.id ? String(payload.agent.id) : ''
        if (sid) {
          // 会话被直接关闭：显式标 disposed，不让空 endReason 冒充完成
          const rec = activeSessions.get(sid)
          if (rec && !rec.endReason) rec.endReason = 'disposed'
          finishSession(sid)
        }
      } catch (err) {
        console.error('[dsh-task-capsule] task-track handle agent/disposed error', err)
      }
    }))
  }))

  return {
    /** 当前快照（活跃任务 + 最近完成），供 /status 路由下发。 */
    snapshot(now) {
      const at = typeof now === 'number' ? now : Date.now()
      const active = []
      for (const [sid, s] of activeSessions) {
        active.push({
          sessionId: sid,
          title: s.title || truncate(s.firstPrompt, 60) || '(无标题)',
          startTime: s.startTime,
          elapsed: at - s.startTime,
          turns: s.turns,
          steps: s.steps,
          toolCalls: s.toolCalls,
          models: [...s.models],
          provider: s.provider,
          phase: s.phase,
          phaseAt: s.phaseAt,
          lastActivityAt: s.lastActivityAt,
          approvals: [...s.approvals.entries()].map(([id, v]) => ({ id, ...v })),
          questions: [...s.questions.entries()].map(([id, v]) => ({ id, ...v })),
        })
      }
      // 最近完成以落盘账本为准（重启后仍在），内存数组只做加速
      const stored = ledger.records()
      const recent = stored.length > 0 ? stored.slice(0, 20) : completedSessions.slice(0, 20)
      // 运行中快照顺手落盘（内部 5s 节流），崩溃后靠它恢复
      ledger.saveOpen(active, at)
      return { now: at, active, recent, stats: ledger.stats() }
    },
    /** 任务结束订阅（返回退订函数）；异常不会打断其他订阅者。 */
    onFinish(fn) {
      if (typeof fn !== 'function') return () => {}
      finishListeners.add(fn)
      return () => { finishListeners.delete(fn) }
    },
    /** 账本区间查询：账本面板与对账都走这里，只读。 */
    ledgerQuery(opts) {
      const o = opts || {}
      const since = Number(o.since) || 0
      const until = Number(o.until) || (Date.now() + 1)
      const limit = Math.max(1, Math.min(100, Number(o.limit) || 10))
      const offset = Math.max(0, Number(o.offset) || 0)
      const all = ledger.records().filter((r) => (r.endTime || 0) >= since && (r.endTime || 0) < until)
      return {
        since, until, offset, limit,
        total: all.length,
        records: all.slice(offset, offset + limit),
        summary: summarizeRecords(all),
      }
    },
    /** 区间导出：一次拉全量（内存上限 1000 条），CSV/JSONL 由浏览器侧拼装。 */
    ledgerExport(opts) {
      const o = opts || {}
      const since = Number(o.since) || 0
      const until = Number(o.until) || (Date.now() + 1)
      const records = ledger.records().filter((r) => (r.endTime || 0) >= since && (r.endTime || 0) < until)
      return { since, until, count: records.length, records }
    },
    /** 标记已读（浏览器展开下拉时调用）。 */
    markRead(at) {
      return ledger.markRead(at)
    },
    /** 账本磁盘路径与统计（设置页/排障用）。 */
    ledgerInfo() {
      return { paths: ledger.paths, stats: ledger.stats() }
    },
    /** 退订会话事件（插件卸载时调用）。 */
    dispose() {
      finishListeners.clear()
      activeSessions.clear()
      completedSessions.length = 0
      while (disposers.length > 0) {
        const fn = disposers.pop()
        try { if (typeof fn === 'function') fn() } catch { /* 退订失败不影响卸载 */ }
      }
    },
  }
}
