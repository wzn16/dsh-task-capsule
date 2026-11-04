/**
 * dsh-task-capsule — 浏览器半部（手写 __ModuleLoader__ bundle，无构建链，勿用 JSX）。
 *
 * 两块 UI：
 *  1. 运行任务胶囊（in-flow 挂会话 header 右侧 utilities 行）：「N 个任务 · 耗时」，
 *     圆点颜色=阶段；点击跳转对应会话（多任务/空闲展开下拉列表点选，Esc 关闭）。
 *  2. 任务通知卡栈（shell.overlay 全局浮层，portal 进会话 pane 避开右栏）：
 *     完成/出错/需确认卡片 + 提示音 + 可选系统通知；显式「前往会话」按钮跳转（防误触）。
 * 设置页（settings.section）：通知行为开关。
 * 不含 token 统计（DSH 自带会话统计条已给 token/缓存命中；费用估算按用户裁决移除）。
 *
 * Host 通信：fetch('/dsh-task-capsule/runstate/status' | '/dsh-task-capsule/notify/status|config')。
 * 跳转会话：uiWorkspace.openSession（含跨工作区切换），回退 sessions.open。
 */
window.__ModuleLoader__.load({
	id: "dsh-task-capsule",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var react = require("react");
		var reactDom = require("react-dom");
		var h = react.createElement;

		//#region i18n
		// 词条源码在 locale/*.json，下面这段由 `node scripts/gen-locale.mjs` 生成，别手改。
		// zh 是作者的原文，也是默认值与兜底：locale 服务缺失、词条缺失、语言未知时都回落到它。
		/* locale-messages:start */
		var MESSAGES = {
			"zh": {
				"ask.optionCount": " 个选项）",
				"ask.options": "选项",
				"ask.questions": " 个问题",
				"ask.waitingTitle": "❓ 等待选择：",
				"capsule.activeCount": " 个任务 · ",
				"capsule.approvalsSuffix": " 待确认",
				"capsule.asksSuffix": " 待选择",
				"capsule.empty": "暂无任务记录",
				"capsule.idleNoTasks": "空闲 · 无任务",
				"capsule.idlePrefix": "空闲 · ",
				"capsule.idleRecent": "空闲 · 点击展开最近完成",
				"capsule.rpcTimeout": "请求超时（",
				"capsule.rpcTimeoutSuffix": "s）",
				"capsule.tasksSuffix": " 任务",
				"capsule.titleExpand": "点击展开任务列表",
				"capsule.titleJump": "点击跳转对应会话",
				"capsule.titleSingleConfirm": "点击跳转等待确认的会话",
				"capsule.titleUnread": " 条未读，点击展开",
				"capsule.unreadSuffix": " 条未读",
				"common.colon": "：",
				"common.listSep": "、",
				"common.openParen": "（",
				"common.period": "。",
				"common.pipe": "｜",
				"common.untitled": "(无标题)",
				"confirm.toolFallback": "工具",
				"confirm.waitingTitle": "✋ 等待确认：",
				"end.aborted": "已中止",
				"end.blocked": "受阻",
				"end.completed": "完成",
				"end.disposed": "会话已关闭",
				"end.error": "出错",
				"end.interrupted": "中断",
				"end.maxTokens": "达输出上限",
				"end.unknown": "结果未知",
				"error.noSlots": "[dsh-task-capsule] 宿主未提供 slots 服务（版本不兼容？）——胶囊与通知不可用，仅设置页保留",
				"ledger.chipConfirm": "等确认 ",
				"ledger.chipFail": "失败 ",
				"ledger.chipInterrupted": "中断 ",
				"ledger.collapse": "▾ 收起",
				"ledger.copied": "已复制",
				"ledger.copy": "复制摘要",
				"ledger.daySuffix": "日",
				"ledger.emptyToday": "今天还没有记录",
				"ledger.emptyTodaySummary": "今天还没有完成任务。",
				"ledger.end": "结束：",
				"ledger.expand": "▸ 展开",
				"ledger.loadMore": "加载更多（还有 ",
				"ledger.loadMoreClose": " 条）",
				"ledger.loading": "正在读取…",
				"ledger.models": "模型：",
				"ledger.monthSuffix": "月",
				"ledger.nextDay": "往后一天",
				"ledger.noRecords": "还没有记录。",
				"ledger.prevDay": "往前一天",
				"ledger.readFailed": "读取失败：",
				"ledger.reading": "读取中…",
				"ledger.recoveredTag": "（中断恢复）",
				"ledger.retry": "重试",
				"ledger.rowApprovalWait": "审批等待 ",
				"ledger.rowApprovals": " 次审批，共等 ",
				"ledger.rowSteps": " 步 / ",
				"ledger.rowStepsDot": " 步 · ",
				"ledger.rowTools": " 次工具",
				"ledger.rowToolsLong": " 次工具调用",
				"ledger.start": "开始 ",
				"ledger.startEnd": " → 结束 ",
				"ledger.summaryApprovalWait": "等你确认 ",
				"ledger.summaryFailed": " 个没跑成",
				"ledger.summaryInterrupted": " 个中断",
				"ledger.summaryPrefix": "今天 ",
				"ledger.summaryRecoveredClose": " 个重启恢复）",
				"ledger.summaryRecoveredOpen": "（含 ",
				"ledger.summaryTasks": " 个任务",
				"ledger.summaryTotal": "共 ",
				"ledger.title": "任务账本",
				"ledger.today": "今天",
				"ledger.yesterday": "昨天",
				"notify.askBodySuffix": " 组选项在等你拍板",
				"notify.askTitle": "❓ dsh 等你选择",
				"notify.confirmBodySuffix": " 个工具在等确认",
				"notify.confirmTitle": "✋ dsh 任务等待确认",
				"notify.doneTitle": "✅ dsh 任务完成",
				"notify.failTitle": "❌ dsh 任务",
				"notify.testBodyDisabled": "通知权限正常，但「浏览器系统通知」开关未开：任务结束时不会推送系统通知，请到设置里打开开关。",
				"notify.testBodyOk": "系统通知链路已打通：任务完成 / 等待确认时会在系统通知中心提醒。",
				"notify.testTitle": "✅ dsh-task-capsule 测试通知",
				"notify.testTitleWarn": "⚠️ dsh-task-capsule 测试通知（仅权限链路）",
				"phase.busy": "工作中",
				"phase.code": "编写代码",
				"phase.search": "查资料",
				"phase.think": "思考中",
				"phase.write": "输出中",
				"pop.activeHead": "进行中任务 · 点击跳转",
				"pop.recentHead": "最近完成 · 点击跳转",
				"settings.cardDuration": "卡片停留时长",
				"settings.duration15s": "15 秒",
				"settings.duration30s": "30 秒",
				"settings.duration5s": "5 秒",
				"settings.duration8s": "8 秒",
				"settings.durationPersistent": "常驻直到手动关闭",
				"settings.foreground": "前台时也推系统通知",
				"settings.foregroundDesc": "默认仅页面在后台时推送；开启后任务结束/等待确认时不分前后台都推",
				"settings.intro1": "会话 header 任务胶囊、完成/出错/等待时的提醒卡、按天记账的任务账本。",
				"settings.intro2": "提醒只在你不在窗口前时发出；token 统计交给 DSH 自带会话统计条。",
				"settings.loading": "正在读取通知配置…",
				"settings.mainWindowOnly": "完成卡只弹主窗口",
				"settings.mainWindowOnlyDesc": "多窗口时，完成/出错的页内卡片只由主窗口弹出（待确认、待选择不受影响）",
				"settings.notifyAsk": "选项提醒",
				"settings.notifyAskDesc": "DSH 弹选项选择（ask_user_question）等你拍板时提醒；不选它回合就一直停着",
				"settings.notifyConfirm": "需确认通知",
				"settings.notifyConfirmDesc": "工具等待批准时提醒",
				"settings.notifyDone": "完成通知",
				"settings.notifyDoneDesc": "任务正常结束时弹卡片",
				"settings.notifyError": "异常通知",
				"settings.notifyErrorDesc": "任务出错 / 中止 / 受阻时弹卡片",
				"settings.permDefault": "未请求",
				"settings.permDenied": "已被拒绝",
				"settings.permDeniedGuide": "通知权限已被系统拒绝：请在 系统设置 → 通知 → DSH Desktop 中允许通知（Windows：设置 → 系统 → 通知），改完如未生效重启 DSH。",
				"settings.permGranted": "已授权",
				"settings.permGuide": "点右侧按钮弹出系统授权弹窗，允许后自动发送测试通知",
				"settings.permRequest": "请求授权并测试",
				"settings.permTest": "发测试通知",
				"settings.permTitle": "系统通知权限",
				"settings.permUnsupported": "当前环境不支持",
				"settings.presetQuiet": "安静",
				"settings.presetQuietDesc": "只有工具在等你确认时才提醒；完成与出错只记未读。",
				"settings.presetStandard": "标准",
				"settings.presetStandardDesc": "离开窗口时提醒一次；正看着屏幕时不打扰。",
				"settings.presetWatch": "看护",
				"settings.presetWatchDesc": "全部提醒，系统通知常开，卡片常驻到手动关闭。",
				"settings.sectionHow": "怎么提醒",
				"settings.sectionIntensity": "提醒强度",
				"settings.sectionWhat": "提醒什么",
				"settings.sound": "提示音",
				"settings.soundChime": "chime（双音）",
				"settings.soundDesc": "WebAudio 合成，无音频文件；等待确认与选项固定单音",
				"settings.soundDing": "ding（单音）",
				"settings.soundEffect": "完成提示音音效",
				"settings.systemNotify": "浏览器系统通知",
				"settings.systemNotifyDesc": "Electron 客户端内为系统级通知（macOS 通知中心 / Windows Toast）",
				"slot.capsuleLabel": "dsh-task-capsule 任务胶囊",
				"slot.overlayLabel": "dsh-task-capsule 通知卡栈",
				"slot.settingsLabel": "任务胶囊",
				"toast.action": "前往会话 →",
				"toast.actionLabel": "前往对应会话",
				"toast.allDone": "（全部完成）",
				"toast.badSuffix": " 个异常）",
				"toast.close": "关闭",
				"toast.detailsHint": "｜详情见胶囊下拉",
				"toast.donePrefix": "✅ 完成：",
				"toast.finishedCount": " 个任务已结束",
				"toast.longest": "最长 ",
				"unit.hour": "小时",
				"unit.minute": "分",
				"unit.second": "秒"
			},
			"en": {
				"ask.optionCount": " options)",
				"ask.options": "Options",
				"ask.questions": " questions",
				"ask.waitingTitle": "❓ Waiting for a choice: ",
				"capsule.activeCount": " tasks · ",
				"capsule.approvalsSuffix": " awaiting approval",
				"capsule.asksSuffix": " awaiting choice",
				"capsule.empty": "No tasks yet",
				"capsule.idleNoTasks": "Idle · no tasks",
				"capsule.idlePrefix": "Idle · ",
				"capsule.idleRecent": "Idle · click to see recent completions",
				"capsule.rpcTimeout": "Request timed out (",
				"capsule.rpcTimeoutSuffix": "s)",
				"capsule.tasksSuffix": " tasks",
				"capsule.titleExpand": "Click to expand the task list",
				"capsule.titleJump": "Click to open the session",
				"capsule.titleSingleConfirm": "Click to open the session waiting for approval",
				"capsule.titleUnread": " unread, click to expand",
				"capsule.unreadSuffix": " unread",
				"common.colon": ": ",
				"common.listSep": ", ",
				"common.openParen": " (",
				"common.period": ". ",
				"common.pipe": " | ",
				"common.untitled": "(untitled)",
				"confirm.toolFallback": "tool",
				"confirm.waitingTitle": "✋ Waiting for approval: ",
				"end.aborted": "Cancelled",
				"end.blocked": "Blocked",
				"end.completed": "Done",
				"end.disposed": "Session closed",
				"end.error": "Error",
				"end.interrupted": "Interrupted",
				"end.maxTokens": "Hit output limit",
				"end.unknown": "Unknown result",
				"error.noSlots": "[dsh-task-capsule] the host does not provide the slots service (incompatible version?) — capsule and notifications are unavailable, only the settings page stays active",
				"ledger.chipConfirm": "Awaiting ",
				"ledger.chipFail": "Failed: ",
				"ledger.chipInterrupted": "Interrupted: ",
				"ledger.collapse": "▾ Collapse",
				"ledger.copied": "Copied",
				"ledger.copy": "Copy summary",
				"ledger.daySuffix": "",
				"ledger.emptyToday": "No records today yet",
				"ledger.emptyTodaySummary": "No tasks have finished today yet.",
				"ledger.end": "End: ",
				"ledger.expand": "▸ Expand",
				"ledger.loadMore": "Load more (",
				"ledger.loadMoreClose": " left)",
				"ledger.loading": "Reading…",
				"ledger.models": "Models: ",
				"ledger.monthSuffix": "/",
				"ledger.nextDay": "Next day",
				"ledger.noRecords": " no records yet.",
				"ledger.prevDay": "Previous day",
				"ledger.readFailed": "Failed to read: ",
				"ledger.reading": "Reading…",
				"ledger.recoveredTag": " (recovered)",
				"ledger.retry": "Retry",
				"ledger.rowApprovalWait": "Approval wait ",
				"ledger.rowApprovals": " approvals, waiting ",
				"ledger.rowSteps": " steps / ",
				"ledger.rowStepsDot": " steps · ",
				"ledger.rowTools": " tool calls",
				"ledger.rowToolsLong": " tool calls",
				"ledger.start": "Start ",
				"ledger.startEnd": " → End ",
				"ledger.summaryApprovalWait": "waiting on you ",
				"ledger.summaryFailed": " failed",
				"ledger.summaryInterrupted": " interrupted",
				"ledger.summaryPrefix": "Today: ",
				"ledger.summaryRecoveredClose": " recovered after restart)",
				"ledger.summaryRecoveredOpen": " (incl. ",
				"ledger.summaryTasks": " tasks",
				"ledger.summaryTotal": "Total: ",
				"ledger.title": "Task ledger",
				"ledger.today": "Today",
				"ledger.yesterday": "Yesterday",
				"notify.askBodySuffix": " option groups waiting for you",
				"notify.askTitle": "❓ dsh is waiting for your choice",
				"notify.confirmBodySuffix": " tools waiting for approval",
				"notify.confirmTitle": "✋ A dsh task awaits approval",
				"notify.doneTitle": "✅ dsh task finished",
				"notify.failTitle": "❌ dsh task",
				"notify.testBodyDisabled": "Notification permission is fine, but the “System notifications” switch is off: nothing is sent when tasks finish. Turn it on in Settings.",
				"notify.testBodyOk": "System notifications are working: you will be alerted in the notification center when a task finishes or waits for approval.",
				"notify.testTitle": "✅ dsh-task-capsule test notification",
				"notify.testTitleWarn": "⚠️ dsh-task-capsule test notification (permission check only)",
				"phase.busy": "Working",
				"phase.code": "Coding",
				"phase.search": "Researching",
				"phase.think": "Thinking",
				"phase.write": "Writing",
				"pop.activeHead": "Running tasks · click to open",
				"pop.recentHead": "Recently finished · click to open",
				"settings.cardDuration": "Card duration",
				"settings.duration15s": "15 s",
				"settings.duration30s": "30 s",
				"settings.duration5s": "5 s",
				"settings.duration8s": "8 s",
				"settings.durationPersistent": "Stays until closed",
				"settings.foreground": "Notify in the foreground too",
				"settings.foregroundDesc": "By default only while the page is in the background; when on, it also notifies while you are watching",
				"settings.intro1": "A task capsule in the session header, alert cards on completion/error/waiting, and a daily task ledger.",
				"settings.intro2": "Alerts only fire while you are away from the window; token counting stays with the DSH stats bar.",
				"settings.loading": "Reading notification settings…",
				"settings.mainWindowOnly": "Completion card in the main window only",
				"settings.mainWindowOnlyDesc": "With several windows, the completion/error card is only shown by the main window (approvals and choices are unaffected)",
				"settings.notifyAsk": "Choice alert",
				"settings.notifyAskDesc": "Alert when DSH asks you to choose (ask_user_question); the turn stays paused until you pick",
				"settings.notifyConfirm": "Approval alert",
				"settings.notifyConfirmDesc": "Alert when a tool awaits approval",
				"settings.notifyDone": "Completion alert",
				"settings.notifyDoneDesc": "Show a card when a task finishes normally",
				"settings.notifyError": "Error alert",
				"settings.notifyErrorDesc": "Show a card when a task fails, is cancelled or gets blocked",
				"settings.permDefault": "Not requested",
				"settings.permDenied": "Denied",
				"settings.permDeniedGuide": "Notification permission was refused by the system: allow notifications for DSH Desktop in System Settings → Notifications (Windows: Settings → System → Notifications). Restart DSH if it does not take effect.",
				"settings.permGranted": "Granted",
				"settings.permGuide": "Click the button on the right to open the system permission prompt; a test notification is sent once you allow it.",
				"settings.permRequest": "Request permission and test",
				"settings.permTest": "Send a test notification",
				"settings.permTitle": "Notification permission",
				"settings.permUnsupported": "Not supported here",
				"settings.presetQuiet": "Quiet",
				"settings.presetQuietDesc": "Only alert when a tool awaits approval; completions and errors just count as unread.",
				"settings.presetStandard": "Standard",
				"settings.presetStandardDesc": "Alert once when you leave the window; stay quiet while you are watching.",
				"settings.presetWatch": "Watchful",
				"settings.presetWatchDesc": "Alert on everything, keep system notifications on, and leave cards open until closed.",
				"settings.sectionHow": "How to alert",
				"settings.sectionIntensity": "Alert level",
				"settings.sectionWhat": "What to alert",
				"settings.sound": "Sound",
				"settings.soundChime": "chime (two tones)",
				"settings.soundDesc": "Synthesised with WebAudio, no audio files; approvals and choices always use a single tone",
				"settings.soundDing": "ding (one tone)",
				"settings.soundEffect": "Completion sound",
				"settings.systemNotify": "System notifications",
				"settings.systemNotifyDesc": "Inside the Electron client these are system-level notifications (macOS Notification Center / Windows toast)",
				"slot.capsuleLabel": "dsh-task-capsule · capsule",
				"slot.overlayLabel": "dsh-task-capsule · toasts",
				"slot.settingsLabel": "Task capsule",
				"toast.action": "Open session →",
				"toast.actionLabel": "Go to the session",
				"toast.allDone": " (all done)",
				"toast.badSuffix": " with errors)",
				"toast.close": "Close",
				"toast.detailsHint": " | details in the capsule menu",
				"toast.donePrefix": "✅ Done: ",
				"toast.finishedCount": " tasks finished",
				"toast.longest": "Longest: ",
				"unit.hour": "h ",
				"unit.minute": "m ",
				"unit.second": "s"
			}
		};
		/* locale-messages:end */
		var FALLBACK_LOCALE = "zh";
		var activeLocale = FALLBACK_LOCALE;

		// 只认主语言标签：pt-BR / pt-PT → pt，en-US → en，其余回退 zh
		function resolveLocaleTag(id) {
			var tag = String(id || "").toLowerCase();
			if (tag.indexOf("zh") === 0) return "zh";
			if (tag.indexOf("pt") === 0) return "pt";
			if (tag.indexOf("en") === 0) return "en";
			return FALLBACK_LOCALE;
		}

		function tr(key) {
			var dict = MESSAGES[activeLocale];
			var text = dict ? dict[key] : undefined;
			if (text === undefined) {
				var base = MESSAGES[FALLBACK_LOCALE];
				text = base ? base[key] : undefined;
			}
			return text === undefined ? key : text;
		}
		//#endregion


		//#region css
		var CSS = [
			// 主题桥接：亮/暗两套强调色（与 dsh-dock 同款取值思路）
			"body{--pl-accent:#2f6fed;--pl-warn:#b45309;--pl-ok:var(--dsw-alias-state-success-primary,#16a34a);--pl-err:var(--dsw-alias-state-error-primary,#dc2626);}",
			"body[data-ds-dark-theme]{--pl-accent:#4d9fff;--pl-warn:#fbbf24;--pl-ok:var(--dsw-alias-state-success-primary,#34d399);--pl-err:var(--dsw-alias-state-error-primary,#f87171);}",
			// ---- 任务胶囊：in-flow 挂在会话 header 右侧 utilities 行（chrome 行，不遮消息区）；
			// 视觉语言对齐 MCP 徽标（白底圆 pill + 状态圆点），运行态只给圆点细微脉冲 ----
			".plp-wrap{position:relative;display:inline-flex;}",
			".plp-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l1,#d7dae0);border-radius:99px;background:var(--dsw-alias-bg-base,#fdfdfd);color:var(--dsw-alias-label-primary,#1c1e26);font-size:12px;line-height:16px;cursor:pointer;font-family:inherit;}",
			".plp-pill:hover{border-color:color-mix(in srgb,var(--pl-accent) 45%,transparent);}",
			".plp-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--pl-accent);}",
			".plp-pill.plp-run .plp-dot{animation:pl-pulse 1.6s ease-in-out infinite;}",
			"@keyframes pl-pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--pl-accent) 40%,transparent);}50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--pl-accent) 10%,transparent);}}",
			"@media (prefers-reduced-motion:reduce){.plp-pill.plp-run .plp-dot,.plp-pill.plp-wait .plp-dot{animation:none;}}",
			".plp-pill.plp-wait{border-color:color-mix(in srgb,var(--pl-warn) 55%,transparent);}",
			".plp-pill.plp-wait .plp-dot{background:var(--pl-warn);animation:pl-pulse-warn 1.6s ease-in-out infinite;}",
			"@keyframes pl-pulse-warn{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--pl-warn) 40%,transparent);}50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--pl-warn) 10%,transparent);}}",
			".plp-pill.plp-idle{opacity:.75;}",
			".plp-pill.plp-idle .plp-dot{background:var(--dsw-alias-label-tertiary,#888);animation:none;}",
			".plp-txt{white-space:nowrap;}",
			// 胶囊展开列表（多任务/最近完成）：从胶囊正下方临时下拉
			".plp-pop{position:absolute;top:calc(100% + 8px);right:0;z-index:330;width:320px;max-width:calc(100vw - 24px);border:1px solid var(--dsw-alias-border-l1,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);border-radius:12px;box-shadow:0 12px 40px rgb(0 0 0 / .18);padding:6px;display:flex;flex-direction:column;gap:2px;}",
			".plp-pop-head{padding:6px 10px 4px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);}",
			".plp-item{display:flex;align-items:center;gap:8px;border:none;background:transparent;border-radius:8px;padding:7px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#111);text-align:left;}",
			".plp-item:hover{background:color-mix(in srgb,var(--pl-accent) 8%,transparent);}",
			".plp-item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}",
			".plp-item .m{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#666);}",
			".plp-item .dot{flex:none;width:7px;height:7px;border-radius:50%;}",
			// ---- 通知卡栈 ----
			".pln-stack{position:absolute;top:10px;right:10px;z-index:320;display:flex;flex-direction:column;gap:8px;width:340px;max-width:calc(100vw - 28px);pointer-events:none;}",
			".pln-stack.pln-fixed{position:fixed;top:14px;right:14px;}",
			".pln-toast{pointer-events:auto;position:relative;border:1px solid var(--dsw-alias-border-l1,#ddd);border-left:3px solid var(--pl-ok);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);border-radius:12px;box-shadow:0 10px 32px rgb(0 0 0 / .16);padding:10px 30px 10px 12px;cursor:pointer;animation:pl-in .18s ease-out;}",
			".pln-toast.err{border-left-color:var(--pl-err);}",
			".pln-toast.warn{border-left-color:var(--pl-warn);}",
			".pln-toast.ask{border-left-color:var(--pl-accent);}",
			"@keyframes pl-in{from{opacity:0;transform:translateX(12px);}to{opacity:1;transform:none;}}",
			".pln-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".pln-meta{margin-top:3px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".pln-close{position:absolute;top:6px;right:6px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#888);border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:12px;}",
			".pln-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111);}",
			// 跳转改为显式按钮（卡片本体不可点，防误触）
			".pln-foot{margin-top:6px;display:flex;justify-content:flex-end;}",
			".pln-go{border:1px solid color-mix(in srgb,var(--pl-accent) 40%,transparent);background:color-mix(in srgb,var(--pl-accent) 8%,transparent);color:var(--pl-accent);border-radius:7px;padding:3px 10px;font-size:11px;cursor:pointer;font-family:inherit;}",
			".pln-go:hover{background:color-mix(in srgb,var(--pl-accent) 16%,transparent);}",

			// ---- 设置页 ----
			".pls-root{display:flex;flex-direction:column;gap:10px;color:var(--dsw-alias-label-primary,#111);font-size:13px;}",
			".pls-intro{color:var(--dsw-alias-label-secondary,#666);line-height:1.6;}",
			".pls-card{border:1px solid var(--dsw-alias-border-l1,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;}",
			".pls-row{display:flex;align-items:center;gap:10px;padding:2px 0;}",
			".pls-label{flex:1;}",
			".pls-desc{color:var(--dsw-alias-label-secondary,#666);font-size:12px;margin-top:2px;}",
			".pls-preset{display:flex;flex-direction:column;gap:6px;}",
			".pls-seg{display:flex;gap:0;border:1px solid var(--dsw-alias-border-l1,#d7dae0);border-radius:8px;overflow:hidden;}",
			".pls-seg-btn{flex:1;border:none;background:transparent;padding:7px 10px;font-family:inherit;font-size:13px;color:var(--dsw-alias-label-primary,#111);cursor:pointer;}",
			".pls-seg-btn+.pls-seg-btn{border-left:1px solid var(--dsw-alias-border-l1,#d7dae0);}",
			".pls-seg-btn.on{background:color-mix(in srgb,var(--pl-accent) 12%,transparent);font-weight:600;}",
			".pls-sum{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,#666);padding:2px 0;}",
			".pls-h{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#666);letter-spacing:.02em;}",
			".pls-card>div.pls-row, .pls-card>div.pls-h{padding:1px 0;}",
			".pls-ledger-card{gap:8px;}",
			".pls-ledger-bar{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;padding:0;font-family:inherit;font-size:13px;color:inherit;cursor:pointer;text-align:left;}",
			".plb-title{font-weight:600;}",
			".plb-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#666);}",
			".plb-arrow{font-size:12px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;}",
			".plb-chips{display:flex;flex-wrap:wrap;gap:6px;}",
			".plb-chip{font-size:11px;line-height:18px;padding:1px 9px;border-radius:99px;background:var(--dsw-alias-bg-base,#f4f5f7);color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;}",
			".plb-chip-acc{color:var(--pl-accent);background:color-mix(in srgb,var(--pl-accent) 10%,transparent);}",
			".plb-chip-warn{color:var(--pl-warn);background:color-mix(in srgb,var(--pl-warn) 12%,transparent);}",
			".plb-chip-bad{color:var(--pl-err);background:color-mix(in srgb,var(--pl-err) 10%,transparent);}",
			".pls-daynav{display:flex;align-items:center;gap:6px;margin:2px 0 4px;}",
			".pls-ledger{gap:4px;}",
			".pls-entry{border-top:1px solid var(--dsw-alias-border-l1,#e6e8ec);padding-top:4px;}",
			".pls-entry-head{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;padding:6px 0;font-family:inherit;font-size:13px;color:inherit;cursor:pointer;text-align:left;}",
			".pls-entry-head .dot{width:7px;height:7px;border-radius:50%;flex:none;}",
			".pls-entry-head .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".pls-entry-head .m{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#666);}",
			".pls-entry-body{display:flex;flex-direction:column;gap:3px;padding:0 0 8px 15px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);}",
			".pls-btn[disabled]{opacity:.4;cursor:default;}",
			".pls-sw{flex:none;position:relative;width:34px;height:19px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#ccc);background:var(--dsw-alias-bg-layer-2,#f4f4f4);cursor:pointer;padding:0;transition:background .18s,border-color .18s;}",
			".pls-sw::after{content:\"\";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgb(0 0 0 / .35);transition:transform .18s;}",
			".pls-sw.on{background:var(--pl-ok);border-color:transparent;}",
			".pls-sw.on::after{transform:translateX(15px);}",
			".pls-sel{flex:none;border:1px solid var(--dsw-alias-border-l2,#ccc);background:var(--dsw-alias-bg-layer-2,#f4f4f4);color:var(--dsw-alias-label-primary,#111);border-radius:8px;padding:3px 8px;font-family:inherit;font-size:12px;}",
			// 权限徽标（三态）+ 小按钮 + denied 引导文案
			".pls-badge{flex:none;display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:2px 9px;font-size:11px;line-height:16px;border:1px solid transparent;}",
			".pls-badge::before{content:\"\";width:6px;height:6px;border-radius:50%;background:currentColor;}",
			".pls-badge.ok{color:var(--pl-ok);border-color:color-mix(in srgb,var(--pl-ok) 40%,transparent);background:color-mix(in srgb,var(--pl-ok) 8%,transparent);}",
			".pls-badge.off{color:var(--dsw-alias-label-tertiary,#888);border-color:var(--dsw-alias-border-l2,#ccc);background:transparent;}",
			".pls-badge.err{color:var(--pl-err);border-color:color-mix(in srgb,var(--pl-err) 40%,transparent);background:color-mix(in srgb,var(--pl-err) 8%,transparent);}",
			".pls-btn{flex:none;border:1px solid color-mix(in srgb,var(--pl-accent) 40%,transparent);background:color-mix(in srgb,var(--pl-accent) 8%,transparent);color:var(--pl-accent);border-radius:7px;padding:3px 10px;font-size:11px;cursor:pointer;font-family:inherit;}",
			".pls-btn:hover{background:color-mix(in srgb,var(--pl-accent) 16%,transparent);}",
			".pls-guide{font-size:11px;color:var(--pl-err);line-height:1.5;margin-top:2px;}",
		].join("\n");

		var cssTag = null;
		function ensureCss() {
			if (typeof document === "undefined") return;
			try {
				if (!cssTag || !cssTag.isConnected) {
					cssTag = document.querySelector('style[data-plugin-css="dsh-task-capsule"]');
					if (!cssTag) {
						cssTag = document.createElement("style");
						cssTag.dataset.pluginCss = "dsh-task-capsule";
						document.head.appendChild(cssTag);
					}
				}
				cssTag.textContent = CSS;
			} catch (e) { /* 样式注入失败只降级 */ }
		}
		//#endregion

		// 平台符号集中地（与 src/platform.js 保持一致，smoke.mjs 会校验一致）
		var PLATFORM = {
			slots: {
				capsule: "conversation.session.header.utilities",
				overlay: "shell.overlay",
				settings: "settings.section",
			},
			pane: ["main.conversation", "conversation.session"],
		};

		//#region helpers
		// 多标签租约：只有一个窗口播声音/发系统通知，避免两个窗口各响一次
		var LEASE_KEY = "dsh-task-capsule.leader";
		var TAB_ID = Math.random().toString(36).slice(2);
		function isLeader() {
			try {
				var raw = localStorage.getItem(LEASE_KEY);
				var v = raw ? JSON.parse(raw) : null;
				var stale = !v || !v.id || Date.now() - (Number(v.at) || 0) > 4000;
				if (stale || v.id === TAB_ID) {
					localStorage.setItem(LEASE_KEY, JSON.stringify({ id: TAB_ID, at: Date.now() }));
					return true;
				}
				return false;
			} catch (e) { return true; }
		}

		// 请求超时：无超时时一次挂起会让 loading 永不复位、两个 store 永久停摆
		var RPC_TIMEOUT_MS = 9000;
		function rpc(prefix, method, args) {
			var ctrl = typeof AbortController === "function" ? new AbortController() : null;
			var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, RPC_TIMEOUT_MS) : null;
			function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
			var request;
			try {
				request = fetch("/" + prefix + "/" + method, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(args === undefined ? {} : args),
					signal: ctrl ? ctrl.signal : undefined,
				});
			} catch (e) {
				clearTimer(); // fetch 同步抛（环境无 fetch / URL 非法）也不能漏掉定时器
				throw e;
			}
			return request.then(function (res) {
				// body 读到一半被 abort 时别吞成 {}，否则会把超时误报成 HTTP 200
				return res.json().catch(function (err) { if (err && err.name === "AbortError") throw err; return {}; }).then(function (data) {
					if (res.ok && data && data.ok === true) return data.data;
					throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
				});
			}).then(function (data) {
				clearTimer();
				return data;
			}, function (e) {
				clearTimer();
				if (e && e.name === "AbortError") throw new Error(tr("capsule.rpcTimeout") + (RPC_TIMEOUT_MS / 1000) + tr("capsule.rpcTimeoutSuffix"));
				throw e;
			});
		}

		var PHASE_KEYS = { think: "phase.think", write: "phase.write", code: "phase.code", search: "phase.search" };
		function phaseLabel(p) { return tr(PHASE_KEYS[p] || "phase.busy"); }
		var PHASE_COLORS = { think: "#2f6fed", write: "#0d9488", code: "#b45309", search: "#0e7490" };
		function phaseColor(p) { return PHASE_COLORS[p] || "#2f6fed"; }
		var END_KEYS = {
			completed: "end.completed", error: "end.error", aborted: "end.aborted",
			blocked: "end.blocked", "max-tokens": "end.maxTokens", interrupted: "end.interrupted",
			disposed: "end.disposed", unknown: "end.unknown",
		};
		function endLabel(r) { return tr(END_KEYS[r] || "end.unknown"); }
		// 只有明确的 completed 才算成功：空 endReason（会话被关闭/agent 销毁）曾被判成功，属假阳性
		function isSuccessEnd(r) { return r === "completed"; }

		function fmtClock(ms) {
			var s = Math.max(0, Math.floor((ms || 0) / 1000));
			var hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
			function p(x) { return String(x).padStart(2, "0"); }
			return hh > 0 ? hh + ":" + p(m) + ":" + p(sec) : p(m) + ":" + p(sec);
		}
		function fmtDur(ms) {
			var s = Math.max(0, Math.round((ms || 0) / 1000));
			var hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
			if (hh > 0) return hh + tr("unit.hour") + m + tr("unit.minute") + sec + tr("unit.second");
			if (m > 0) return m + tr("unit.minute") + sec + tr("unit.second");
			return sec + tr("unit.second");
		}
		function truncate(str, max) {
			if (!str) return "";
			return String(str).length > max ? String(str).slice(0, max) + "…" : String(str);
		}

		// 提示音：WebAudio 合成（无音频文件依赖）
		var audioCtx = null;
		function playSound(effect, kind) {
			try {
				var AC = window.AudioContext || window.webkitAudioContext;
				if (!AC) return;
				if (!audioCtx) audioCtx = new AC();
				if (audioCtx.state === "suspended") audioCtx.resume();
				var t0 = audioCtx.currentTime;
				function blip(freq, at, dur, type, gain) {
					var o = audioCtx.createOscillator();
					var g = audioCtx.createGain();
					o.type = type || "sine";
					o.frequency.setValueAtTime(freq, t0 + at);
					g.gain.setValueAtTime(0.0001, t0 + at);
					g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + at + 0.02);
					g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
					o.connect(g); g.connect(audioCtx.destination);
					o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
				}
				if (kind === "error") {
					blip(330, 0, 0.22, "sawtooth", 0.12);
					blip(196, 0.18, 0.3, "sawtooth", 0.12);
					return;
				}
				if (effect === "ding") {
					blip(990, 0, 0.35, "triangle", 0.2);
					return;
				}
				blip(880, 0, 0.16, "sine", 0.16);
				blip(1320, 0.12, 0.28, "sine", 0.16);
			} catch (e) { /* 音频失败静默 */ }
		}

		function systemNotify(title, body, tag, sessionId) {
			try {
				if (typeof window === "undefined" || !("Notification" in window)) return;
				if (Notification.permission !== "granted") return;
				var n = new Notification(title, { body: body, tag: tag });
				// 点通知回到那个会话：否则"跑完了"只是通知你，还得自己找
				n.onclick = function () {
					try { window.focus(); } catch (e) { /* 无窗口焦点时忽略 */ }
					if (sessionId) openSession(sessionId);
					n.close();
				};
			} catch (e) { /* ignore */ }
		}

		// 测试系统通知：设置页一键验证链路；无权限时先请求授权，批准后自动补发
		function sendTestNotify(switchOn) {
			try {
				if (typeof window === "undefined" || !("Notification" in window)) return;
				if (Notification.permission !== "granted") {
					var p = Notification.requestPermission();
					if (p && p.then) p.then(function (r) { if (r === "granted") sendTestNotify(switchOn); });
					return;
				}
				// 开关未开时明确警示「仅权限链路」，避免假阳性（undefined 视为旧调用，不提示）
				var warn = switchOn === false;
				new Notification(warn ? tr("notify.testTitleWarn") : tr("notify.testTitle"), {
					body: warn
						? tr("notify.testBodyDisabled")
						: tr("notify.testBodyOk"),
					tag: "dsh-task-capsule-test",
				});
			} catch (e) { /* ignore */ }
		}
		//#endregion

		//#region stores
		function makeStore(fetcher) {
			return {
				snap: null,
				error: null,
				loading: false,
				listeners: new Set(),
				subscribe: function (fn) {
					this.listeners.add(fn);
					var self = this;
					return function () { self.listeners.delete(fn); };
				},
				// 订阅者抛错会跳过 refresh 的第三跳，loading 永久 true；这里逐个兜住
				emit: function () {
					for (var fn of this.listeners) {
						try { fn(); } catch (e) { console.error("[dsh-task-capsule] store listener error:", e && e.message); }
					}
				},
				refresh: function () {
					var self = this;
					if (self.loading) return Promise.resolve();
					self.loading = true;
					// loading 必须在两条路径上都复位（含同步抛错），否则一次异常即永久停摆
					return Promise.resolve().then(fetcher).then(function (data) {
						self.snap = data; self.error = null; self.emit();
					}, function (e) {
						self.error = (e && e.message) || String(e); self.emit();
					}).then(function () { self.loading = false; });
				},
			};
		}
		// 单一数据源：notify/status 是 runstate 的超集（快照 + 配置 + 未读），只轮询它，
		// 胶囊/通知/设置三处都从这一个 store 派生，活跃态请求数减半
		var capsuleStore = makeStore(function () { return rpc("dsh-task-capsule/notify", "status"); });
		var runStore = capsuleStore;
		var notifyStore = capsuleStore;

		// 去重集合放模块作用域：组件重挂载（切主题/布局变化）会丢 useRef 里的状态，
		// 表现为同一批完成补弹一次或漏弹一次
		var seenDone = null;
		var seenApr = new Set();
		var seenAsk = new Set();

		function markAllRead(store) {
			rpc("dsh-task-capsule/notify", "read", {}).then(function () { return store.refresh(); }).catch(function (e) {
				console.error("[dsh-task-capsule] mark read failed:", e && e.message);
			});
		}

		function useStore(store) {
			var state = react.useState(0);
			var bump = state[1];
			react.useEffect(function () {
				return store.subscribe(function () { bump(function (n) { return n + 1; }); });
			}, [store]);
			return store;
		}
		// runStore 全局轮询（胶囊与侧栏入口共享，避免各自轮询/首页无胶囊时停摆）；apply 启停
		var runPollStop = null;
		function startRunPolling() {
			if (runPollStop) return runPollStop;
			var stopped = false, timer = null;
			function loop() {
				runStore.refresh().then(function () {
					if (stopped) return;
					var st = runStore.snap;
					timer = setTimeout(loop, runStore.error ? 15000 : (st && st.active && st.active.length > 0 ? 2000 : 8000));
				});
			}
			loop();
			runPollStop = function () { stopped = true; if (timer) clearTimeout(timer); runPollStop = null; };
			return runPollStop;
		}
		//#endregion

		var ctxRef = { current: null };

		function openSession(sessionId) {
			var ctx = ctxRef.current;
			if (!ctx || !sessionId) return;
			try {
				// 优先 uiWorkspace.openSession：语义含跨工作区自动切换；不可用再回退 sessions.open
				var uw = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : ctx.uiWorkspace;
				if (uw && typeof uw.openSession === "function") { uw.openSession(sessionId); return; }
				var sessions = typeof ctx.get === "function" ? ctx.get("sessions") : ctx.sessions;
				if (sessions && typeof sessions.open === "function") sessions.open(sessionId);
			} catch (e) {
				console.error("[dsh-task-capsule] open session failed:", e && e.message);
			}
		}

		// 会话 pane 容器（与 MCP 徽标同坐标系）：通知卡栈的 portal 目标，右栏展开不压面板
		function useConversationPane() {
			var state = react.useState(null);
			var el = state[0], setEl = state[1];
			react.useEffect(function () {
				// 宿主对每个 slot 渲染 [data-slot="<slot名>"]；data-pane 在官方壳里已不存在，留作旧版回退
				// 宿主 slot 名是点分路径（asar 里核实：main.conversation / conversation.session）；
				// data-slot="conversation" 与 data-pane 都零命中，后者只作旧版回退
				var PANE_SELECTORS = PLATFORM.pane.map(function (n) { return '[data-slot="' + n + '"]'; }).concat('[data-pane="conversation"]');
				var tries = 0;
				function find() {
					var node = null;
					for (var i = 0; i < PANE_SELECTORS.length && !node; i++) node = document.querySelector(PANE_SELECTORS[i]);
					setEl(node && node.isConnected ? node : null);
					return !!node;
				}
				if (find()) return;
				// 最多探 20 次（16s）就停，避免空转到页面结束
				var t = setInterval(function () {
					tries++;
					if (find() || tries >= 20) { clearInterval(t); }
				}, 800);
				return function () { clearInterval(t); };
			}, []);
			return el;
		}

		// Esc 关闭浮层
		function useEscape(open, onClose) {
			react.useEffect(function () {
				if (!open) return;
				function onKey(e) { if (e.key === "Escape") onClose(); }
				document.addEventListener("keydown", onKey, true);
				return function () { document.removeEventListener("keydown", onKey, true); };
			}, [open]);
		}

		// 最近一次快照时刻（列表条目算走秒用；由 Capsule/ToastStack 更新）
		var lastSnapAt = 0;

		// 任务列表条目（胶囊下拉与侧栏入口下拉共用）
		function taskListNodes(active, recent, pick) {
			// 待确认压在最前：胶囊写着"1 待确认"却要往下翻才找到，是这一步的失职
			var items = active.length > 0
				? active.slice().sort(function (a, b) {
					var wa = (Array.isArray(a.approvals) ? a.approvals.length : 0) + (Array.isArray(a.questions) ? a.questions.length : 0);
					var wb = (Array.isArray(b.approvals) ? b.approvals.length : 0) + (Array.isArray(b.questions) ? b.questions.length : 0);
					if (wa !== wb) return wb - wa;
					return (b.startTime || 0) - (a.startTime || 0);
				})
				: recent;
			return items.slice(0, 8).map(function (t) {
				var isAct = active.length > 0;
				return h("button", {
					type: "button",
					key: isAct ? t.sessionId : t.sessionId + ":" + t.endTime,
					className: "plp-item",
					role: "menuitem",
					onClick: function () { pick(t.sessionId); },
				},
					h("span", { className: "dot", style: { background: isAct ? phaseColor(t.phase) : (isSuccessEnd(t.endReason) ? "var(--pl-ok)" : "var(--pl-err)") } }),
					h("span", { className: "t" }, t.title || tr("common.untitled")),
					h("span", { className: "m" }, isAct ? phaseLabel(t.phase) + " " + fmtClock((t.elapsed || 0) + Math.max(0, Date.now() - (lastSnapAt || Date.now()))) : endLabel(t.endReason) + " " + fmtDur(t.duration)));
			});
		}

		//#region 胶囊 + 列表浮层
		function Capsule(props) {
			var store = useStore(runStore);
			var st = store.snap;
			var popState = react.useState(false);
			var popOpen = popState[0], setPopOpen = popState[1];
			var pillRef = react.useRef(null);
			var popRef = react.useRef(null);

			var active = st && st.active ? st.active : [];
			var recent = st && st.recent ? st.recent : [];
			var approvals = active.reduce(function (n, t) { return n + (Array.isArray(t.approvals) ? t.approvals.length : 0); }, 0);
			var asks = active.reduce(function (n, t) { return n + (Array.isArray(t.questions) ? t.questions.length : 0); }, 0);
			var waiting = approvals + asks;

			// 耗时本地走秒：轮询 2s 一跳会让秒数一跳跳两格，看着像卡住
			var tickState = react.useState(0);
			var bumpTick = tickState[1];
			react.useEffect(function () {
				if (active.length === 0) return;
				var timer = setInterval(function () { bumpTick(function (n) { return n + 1; }); }, 1000);
				return function () { clearInterval(timer); };
			}, [active.length]);

			// 列表浮层打开时点外部关闭
			react.useEffect(function () {
				if (!popOpen) return;
				function onDown(e) {
					if (popRef.current && popRef.current.contains(e.target)) return;
					if (pillRef.current && pillRef.current.contains(e.target)) return;
					setPopOpen(false);
				}
				document.addEventListener("pointerdown", onDown, true);
				return function () { document.removeEventListener("pointerdown", onDown, true); };
			}, [popOpen]);
			useEscape(popOpen, function () { setPopOpen(false); });

			if (!st) return null;

			// 文案与状态：等待确认 > 进行中 > 空闲（空闲只留一个小圆点入口）
			// 胶囊只留「数量 · 耗时」保持短小；阶段用圆点颜色表达（hover title 给文字）
			var cls = "plp-pill", txt = null, title, dotColor = null;
			if (waiting > 0) {
				cls += " plp-wait";
				var parts = [];
				if (approvals > 0) parts.push(approvals + tr("capsule.approvalsSuffix"));
				if (asks > 0) parts.push(asks + tr("capsule.asksSuffix"));
				txt = "✋ " + parts.join(" · ") + (active.length > 1 ? " · " + active.length + tr("capsule.tasksSuffix") : "");
				title = active.length === 1 ? tr("capsule.titleSingleConfirm") : tr("capsule.titleExpand");
			} else if (active.length > 0) {
				cls += " plp-run";
				var newest = active.slice().sort(function (a, b) { return b.startTime - a.startTime; })[0];
				var drift = st && st.now ? (Date.now() - st.now) : 0;
				var elapsed = active.reduce(function (m, t) { return Math.max(m, (t.elapsed || 0) + drift); }, 0);
				txt = active.length + tr("capsule.activeCount") + fmtClock(elapsed);
				dotColor = phaseColor(newest.phase);
				title = (active.length === 1 ? tr("capsule.titleJump") : tr("capsule.titleExpand")) + " · " + phaseLabel(newest.phase);
			} else {
				// 空闲占位：头部位置稳定，明确「当前无任务」；点击仍可翻最近完成
				cls += " plp-idle";
				var unread = (st.stats && st.stats.unread) || 0;
				txt = unread > 0 ? tr("capsule.idlePrefix") + unread + tr("capsule.unreadSuffix") : tr("capsule.idleNoTasks");
				title = unread > 0 ? tr("capsule.idlePrefix") + unread + tr("capsule.titleUnread") : (recent.length > 0 ? tr("capsule.idleRecent") : tr("capsule.empty"));
			}

			function handleClick() {
				if (active.length === 1) { openSession(active[0].sessionId); return; }
				setPopOpen(function (v) {
					var next = !v;
					if (next) markAllRead(runStore); // 展开即已读
					return next;
				});
			}

			return h("span", { className: "plp-wrap" },
				h("button", {
					type: "button",
					ref: pillRef,
					className: cls,
					onClick: handleClick,
					title: title,
					"aria-label": (txt ? txt + tr("common.period") : "") + title,
					// 单任务时点击直接跳会话、不弹菜单：声明 haspopup 会让读屏语义出错
					"aria-haspopup": active.length === 1 ? undefined : "true",
					"aria-expanded": active.length === 1 ? undefined : popOpen,
				},
					h("span", { className: "plp-dot", style: dotColor ? { background: dotColor } : null }),
					txt ? h("span", { className: "plp-txt" }, txt) : null),
				popOpen ? h("div", { ref: popRef, className: "plp-pop", role: "menu" },
					h("div", { className: "plp-pop-head" }, active.length > 0 ? tr("pop.activeHead") : tr("pop.recentHead")),
					(active.length + recent.length) > 0
						? taskListNodes(active, recent, function (sid) { setPopOpen(false); openSession(sid); })
						: h("div", { className: "plp-pop-head" }, tr("capsule.empty"))) : null);
		}
		//#endregion

		//#region 通知卡栈
		function ToastStack(props) {
			var store = useStore(notifyStore);
			var pane = useConversationPane();
			// 轮询交给全局的 startRunPolling（同一个 store），这里不再重复拉
			var toastsState = react.useState([]);
			var toasts = toastsState[0], setToasts = toastsState[1];
			var timersRef = react.useRef(new Map());

			var st = store.snap;
			if (st && st.now) lastSnapAt = st.now;
			var cfg = (st && st.config) || {};

			// 闸门：正盯着屏幕时发生的完成/出错不打扰（只记未读）；离开期间攒下的，回来结算成一张卡
			var FRESH_MS = 10000;
			react.useEffect(function () {
				if (!st) return;
				var visible = typeof document === "undefined" ? true : !document.hidden;
				var focused = typeof document === "undefined" || typeof document.hasFocus !== "function" ? true : document.hasFocus();
				var watching = visible && focused;
				var leader = isLeader(); // 每次轮询都续租约，不只在要提醒时

				// 首帧：已有记录与挂着的审批一律视为已知，刷新页面不补弹
				if (!seenDone) {
					seenDone = new Set((st.recent || []).map(function (r) { return r.sessionId + ":" + r.endTime; }));
					for (var t0 of (st.active || [])) {
						for (var a0 of (t0.approvals || [])) seenApr.add(t0.sessionId + ":" + a0.id);
						for (var q0 of (t0.questions || [])) seenAsk.add(t0.sessionId + ":" + q0.id);
					}
					return;
				}

				var pending = [];
				for (var r of (st.recent || [])) {
					var key = r.sessionId + ":" + r.endTime;
					if (seenDone.has(key)) continue;
					seenDone.add(key);
					if (seenDone.size > 500) seenDone = new Set(Array.from(seenDone).slice(-200));
					var ok = isSuccessEnd(r.endReason);
					if (ok ? cfg.notifyOnComplete === false : cfg.notifyOnError === false) continue;
					// 眼前正在看的不打扰；超过 FRESH_MS 才当"离开期间攒下的"
					var age = Date.now() - (Number(r.endTime) || 0);
					if (watching && age < FRESH_MS) continue;
					pending.push({
						id: key,
						kind: ok ? "done" : "error",
						ok: ok,
						title: (ok ? tr("toast.donePrefix") : "❌ " + endLabel(r.endReason) + tr("common.colon")) + (r.title || tr("common.untitled")),
						meta: fmtDur(r.duration) + (r.errorMessage ? " · " + truncate(r.errorMessage, 60) : ""),
						sessionId: r.sessionId,
						endReason: r.endReason,
						duration: r.duration || 0,
					});
				}

				// 完成卡只弹主窗口（可选开关）：别的窗口看了也是重复噪音；未读照记
				if (cfg.leaderOnlyCards === true && !leader) pending.length = 0;

				var added = [];
				// 多条积压合并成一张：闸门放开后不该被五个「完成」糊脸
				if (pending.length >= 2) {
					var badCount = pending.reduce(function (n, x) { return n + (x.ok ? 0 : 1); }, 0);
					added.push({
						id: "batch:" + pending[pending.length - 1].id + ":" + pending.length,
						kind: badCount > 0 ? "error" : "done",
						title: "🔔 " + pending.length + tr("toast.finishedCount") + (badCount > 0 ? tr("common.openParen") + badCount + tr("toast.badSuffix") : tr("toast.allDone")),
						meta: tr("toast.longest") + fmtDur(Math.max.apply(null, pending.map(function (x) { return x.duration || 0; }))) + tr("toast.detailsHint"),
						sessionId: pending[0].sessionId,
					});
				} else if (pending.length === 1) {
					added.push(pending[0]);
				}

				var confirmCount = 0;
				var askCount = 0;
				if (cfg.notifyOnAsk !== false) {
					for (var ta of (st.active || [])) {
						for (var q of (ta.questions || [])) {
							var qkey = ta.sessionId + ":" + q.id;
							if (seenAsk.has(qkey)) continue;
							seenAsk.add(qkey);
							askCount++;
							var qHead = q.header || (q.count > 1 ? q.count + tr("ask.questions") : tr("ask.options"));
							added.push({
								id: qkey,
								kind: "ask",
								title: tr("ask.waitingTitle") + qHead + (q.optionCount > 0 ? tr("common.openParen") + q.optionCount + tr("ask.optionCount") : ""),
								meta: truncate(q.text || "", 100),
								sessionId: ta.sessionId,
							});
						}
					}
				}
				if (cfg.notifyOnConfirm !== false) {
					for (var t of (st.active || [])) {
						for (var a of (t.approvals || [])) {
							var akey = t.sessionId + ":" + a.id;
							if (seenApr.has(akey)) continue;
							seenApr.add(akey);
							confirmCount++;
							added.push({
								id: akey,
								kind: "confirm",
								title: tr("confirm.waitingTitle") + (a.toolName || tr("confirm.toolFallback")),
								meta: truncate(a.reason || t.title || "", 80),
								sessionId: t.sessionId,
							});
						}
					}
				}

				if (added.length > 0) {
					setToasts(function (prev) { return prev.concat(added).slice(-5); });
					var stay = Number.isFinite(cfg.notifyStayMs) ? cfg.notifyStayMs : 8000;
					if (stay > 0) {
						for (var item of added) {
							var timer = setTimeout(function (id) {
								setToasts(function (prev) { return prev.filter(function (x) { return x.id !== id; }); });
								timersRef.current.delete(id);
							}, stay, item.id);
							timersRef.current.set(item.id, timer);
						}
					}
					// 每次刷新最多响一次，且只有 leader 窗口发声：多任务结不叠音、多窗口不重响
					if (leader && cfg.soundNotify !== false) {
						if (confirmCount + askCount > 0) playSound("ding", "ok");
						else playSound(cfg.soundEffect, pending.length > 0 && !pending[0].ok ? "error" : "ok");
					}
					if (leader && cfg.systemNotify && (cfg.systemNotifyAlways || !watching)) {
						var head = confirmCount + askCount > 0
							? (askCount > 0 ? tr("notify.askTitle") : tr("notify.confirmTitle"))
							: (pending.length >= 2 ? "🔔 " + pending.length + tr("toast.finishedCount")
								: (pending.length === 1 ? (pending[0].ok ? tr("notify.doneTitle") : tr("notify.failTitle") + endLabel(pending[0].endReason)) : ""));
						var body = askCount > 0 ? (askCount + tr("notify.askBodySuffix"))
							: (confirmCount > 0 ? (confirmCount + tr("notify.confirmBodySuffix")) : (pending.length > 0 ? (pending[0].title || "") : ""));
						if (head) systemNotify(head, body, "dsh-task-capsule-batch", pending.length > 0 ? pending[0].sessionId : "");
					}
				}
			}, [st]);

			react.useEffect(function () {
				var timers = timersRef.current;
				return function () { for (var t of timers.values()) clearTimeout(t); timers.clear(); };
			}, []);

			function dismiss(id) {
				var t = timersRef.current.get(id);
				if (t) { clearTimeout(t); timersRef.current.delete(id); }
				setToasts(function (prev) { return prev.filter(function (x) { return x.id !== id; }); });
			}

			// aria-live 容器常驻：与内容同时挂载时部分读屏不播报，空态也保留容器
			// 卡片本体不可点（防误触）：跳转走显式「前往会话」按钮
			// 切会话会换掉 pane 节点：渲染时再判一次 isConnected，失联就回 fixed
			var livePane = pane && pane.isConnected ? pane : null;
			var stackNode = h("div", { className: "pln-stack" + (livePane ? "" : " pln-fixed"), "aria-live": "polite", "aria-atomic": "false" }, toasts.map(function (t) {
				return h("div", {
					key: t.id,
					className: "pln-toast" + (t.kind === "error" ? " err" : t.kind === "ask" ? " ask" : t.kind === "confirm" ? " warn" : ""),
				},
					h("div", { className: "pln-title" }, t.title),
					h("div", { className: "pln-meta" }, t.meta),
					h("div", { className: "pln-foot" },
						h("button", {
							type: "button",
							className: "pln-go",
							"aria-label": tr("toast.actionLabel"),
							onClick: function () { dismiss(t.id); openSession(t.sessionId); },
						}, tr("toast.action"))),
					h("button", {
						type: "button",
						className: "pln-close",
						"aria-label": tr("toast.close"),
						onClick: function () { dismiss(t.id); },
					}, "✕"));
			}));
			return livePane ? reactDom.createPortal(stackNode, livePane) : stackNode;
		}
		//#endregion

		//#region 设置页
		// 预设文案随语言变化，必须在渲染时取，不能在模块加载时固化
		function presetList() {
			return [
				{ id: "quiet", label: tr("settings.presetQuiet"), desc: tr("settings.presetQuietDesc") },
				{ id: "standard", label: tr("settings.presetStandard"), desc: tr("settings.presetStandardDesc") },
				{ id: "watch", label: tr("settings.presetWatch"), desc: tr("settings.presetWatchDesc") },
			];
		}

		function SwitchRow(props) {
			return h("div", { className: "pls-row" },
				h("div", { className: "pls-label" },
					h("div", null, props.label),
					props.desc ? h("div", { className: "pls-desc" }, props.desc) : null),
				h("button", {
					type: "button",
					className: "pls-sw" + (props.on ? " on" : ""),
					role: "switch",
					"aria-checked": !!props.on,
					"aria-label": props.label,
					onClick: props.onToggle,
				}));
		}

		// 系统通知权限状态行：徽标显示授权状态；denied 给系统设置引导；granted 可发测试通知
		function PermRow(props) {
			var perm = props.perm;
			var map = {
				granted: { cls: "ok", label: tr("settings.permGranted") },
				default: { cls: "off", label: tr("settings.permDefault") },
				denied: { cls: "err", label: tr("settings.permDenied") },
				unsupported: { cls: "off", label: tr("settings.permUnsupported") },
			};
			var st = map[perm] || map.unsupported;
			return h("div", { className: "pls-row" },
				h("div", { className: "pls-label" },
					h("div", null, tr("settings.permTitle")),
					perm === "denied" ? h("div", { className: "pls-guide" },
						tr("settings.permDeniedGuide")) : null,
					perm === "default" ? h("div", { className: "pls-desc" }, tr("settings.permGuide")) : null),
				h("span", { className: "pls-badge " + st.cls }, st.label),
				(perm === "granted" || perm === "default") ? h("button", {
					type: "button",
					className: "pls-btn",
					onClick: props.onTest,
				}, perm === "granted" ? tr("settings.permTest") : tr("settings.permRequest")) : null);
		}

		function CapsuleSettings() {
			var store = useStore(notifyStore);
			react.useEffect(function () { if (!store.snap) store.refresh(); }, [store]);
			var cfg = (store.snap && store.snap.config) || null;
			// 系统通知授权状态（纯前端读取 Notification.permission；授权动作后手动刷新）
			var permState = react.useState(function () {
				return (typeof window !== "undefined" && "Notification" in window) ? Notification.permission : "unsupported";
			});
			var perm = permState[0], setPerm = permState[1];
			function refreshPerm() {
				if (typeof window !== "undefined" && "Notification" in window) setPerm(Notification.permission);
			}
			function patch(obj) {
				rpc("dsh-task-capsule/notify", "config", obj).then(function () { return store.refresh(); }).catch(function (e) {
					console.error("[dsh-task-capsule] save notify config failed:", e && e.message);
				});
			}
			if (!cfg) return h("div", { className: "pls-root" }, h("div", { className: "pls-intro" }, tr("settings.loading")));
			return h("div", { className: "pls-root" },
				h("div", { className: "pls-intro" },
					tr("settings.intro1")),
				h("div", { className: "pls-intro" },
					tr("settings.intro2")),
				h("div", { className: "pls-card" },
					h("div", { className: "pls-h" }, tr("settings.sectionIntensity")),
					h("div", { className: "pls-seg" }, presetList().map(function (p) {
						return h("button", {
							type: "button",
							key: p.id,
							className: "pls-seg-btn" + (cfg.preset === p.id ? " on" : ""),
							"aria-pressed": cfg.preset === p.id ? "true" : "false",
							onClick: function () { patch({ preset: p.id }); },
						}, p.label);
					})),
					h("div", { className: "pls-desc", style: { marginTop: "8px" } }, (presetList().filter(function (p) { return p.id === cfg.preset; })[0] || presetList()[1]).desc)),
				h("div", { className: "pls-card" },
					h("div", { className: "pls-h" }, tr("settings.sectionWhat")),
					h(SwitchRow, {
						label: tr("settings.notifyDone"), desc: tr("settings.notifyDoneDesc"),
						on: cfg.notifyOnComplete !== false,
						onToggle: function () { patch({ notifyOnComplete: cfg.notifyOnComplete === false }); },
					}),
					h(SwitchRow, {
						label: tr("settings.notifyError"), desc: tr("settings.notifyErrorDesc"),
						on: cfg.notifyOnError !== false,
						onToggle: function () { patch({ notifyOnError: cfg.notifyOnError === false }); },
					}),
					h(SwitchRow, {
						label: tr("settings.notifyConfirm"), desc: tr("settings.notifyConfirmDesc"),
						on: cfg.notifyOnConfirm !== false,
						onToggle: function () { patch({ notifyOnConfirm: cfg.notifyOnConfirm === false }); },
					}),
					h(SwitchRow, {
						label: tr("settings.notifyAsk"), desc: tr("settings.notifyAskDesc"),
						on: cfg.notifyOnAsk !== false,
						onToggle: function () { patch({ notifyOnAsk: cfg.notifyOnAsk === false }); },
					})),
				h("div", { className: "pls-card" },
					h("div", { className: "pls-h" }, tr("settings.sectionHow")),
					h(SwitchRow, {
						label: tr("settings.sound"), desc: tr("settings.soundDesc"),
						on: cfg.soundNotify !== false,
						onToggle: function () { patch({ soundNotify: cfg.soundNotify === false }); },
					}),
					h("div", { className: "pls-row" },
						h("div", { className: "pls-label" }, h("div", null, tr("settings.soundEffect"))),
						h("select", {
							className: "pls-sel",
							"aria-label": tr("settings.soundEffect"),
							value: cfg.soundEffect || "chime",
							onChange: function (e) { patch({ soundEffect: e.target.value }); },
						},
							h("option", { value: "chime" }, tr("settings.soundChime")),
							h("option", { value: "ding" }, tr("settings.soundDing")))),
					h(SwitchRow, {
						label: tr("settings.systemNotify"), desc: tr("settings.systemNotifyDesc"),
						on: !!cfg.systemNotify,
						onToggle: function () {
							var next = !cfg.systemNotify;
							if (next && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
								var p = Notification.requestPermission();
								if (p && p.then) p.then(function () { refreshPerm(); });
							}
							patch({ systemNotify: next });
						},
					}),
					cfg.systemNotify ? h(SwitchRow, {
						label: tr("settings.foreground"), desc: tr("settings.foregroundDesc"),
						on: !!cfg.systemNotifyAlways,
						onToggle: function () { patch({ systemNotifyAlways: !cfg.systemNotifyAlways }); },
					}) : null,
					h(PermRow, { perm: perm, onTest: function () { sendTestNotify(cfg.systemNotify !== false); } }),
					h(SwitchRow, {
						label: tr("settings.mainWindowOnly"), desc: tr("settings.mainWindowOnlyDesc"),
						on: cfg.leaderOnlyCards === true,
						onToggle: function () { patch({ leaderOnlyCards: !(cfg.leaderOnlyCards === true) }); },
					}),
					h("div", { className: "pls-row" },
						h("div", { className: "pls-label" }, h("div", null, tr("settings.cardDuration"))),
						h("select", {
							className: "pls-sel",
							"aria-label": tr("settings.cardDuration"),
							value: String(Number.isFinite(cfg.notifyStayMs) ? cfg.notifyStayMs : 8000),
							onChange: function (e) { patch({ notifyStayMs: Number(e.target.value) }); },
						},
							h("option", { value: "5000" }, tr("settings.duration5s")),
							h("option", { value: "8000" }, tr("settings.duration8s")),
							h("option", { value: "15000" }, tr("settings.duration15s")),
							h("option", { value: "30000" }, tr("settings.duration30s")),
							h("option", { value: "0" }, tr("settings.durationPersistent"))))),
				h(LedgerPanel, null));
		}
		// 账本面板：今日汇总 + 最近记录 + 详情 + 复制摘要，挂在设置区里（不新开页面，守住一寸地）
		function todayStart() {
			var d = new Date();
			d.setHours(0, 0, 0, 0);
			return d.getTime();
		}

		function dayStartAt(offset) {
			return todayStart() - (Number(offset) || 0) * 86400000;
		}

		function dayLabel(offset) {
			if (offset === 0) return tr("ledger.today");
			if (offset === 1) return tr("ledger.yesterday");
			var d = new Date(dayStartAt(offset));
			// 葡语按「日/月」，中文与英语按「月/日」
			if (activeLocale === "pt") return d.getDate() + "/" + (d.getMonth() + 1);
			return (d.getMonth() + 1) + tr("ledger.monthSuffix") + d.getDate() + tr("ledger.daySuffix");
		}

		function ledgerCsv(records) {
			var head = "endedAt,title,endReason,durationMs,steps,toolCalls,approvalCount,approvalWaitMs,models,recovered,sessionId";
			var rows = [head];
			for (var r of records) {
				var line = [
					new Date(r.endTime || 0).toISOString(),
					r.title || "",
					r.endReason || "",
					r.duration || 0,
					r.steps || 0,
					r.toolCalls || 0,
					r.approvalCount || 0,
					r.approvalWaitMs || 0,
					(r.models || []).join("|"),
					r.recovered ? "true" : "false",
					r.sessionId || "",
				];
				rows.push(line.map(function (v) {
					v = String(v);
					return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
				}).join(","));
			}
			// BOM：让 Excel 认出 UTF-8 的中文
			return "\uFEFF" + rows.join("\r\n");
		}

		function ledgerJsonl(records) {
			var out = "";
			for (var r of records) out += JSON.stringify(r) + "\n";
			return out;
		}

		function summarizeLine(s) {
			if (!s || !s.count) return tr("ledger.emptyTodaySummary");
			var parts = [tr("ledger.summaryPrefix") + s.count + tr("ledger.summaryTasks"), tr("ledger.summaryTotal") + fmtDur(s.durationMs)];
			if (s.approvalWaitMs > 0) parts.push(tr("ledger.summaryApprovalWait") + fmtDur(s.approvalWaitMs));
			if (s.failures > 0) parts.push(s.failures + tr("ledger.summaryFailed"));
			if (s.interrupted > 0) parts.push(s.interrupted + tr("ledger.summaryInterrupted") + (s.recovered > 0 ? tr("ledger.summaryRecoveredOpen") + s.recovered + tr("ledger.summaryRecoveredClose") : ""));
			return parts.join(" · ");
		}

		function LedgerPanel() {
			var openState = react.useState(false);
			var open = openState[0], setOpen = openState[1];
			var state = react.useState({ loading: false, error: null, records: [], total: 0, summary: null, day: 0 });
			var view = state[0], setView = state[1];
			var openIdState = react.useState(null);
			var openId = openIdState[0], setOpenId = openIdState[1];
			var copyState = react.useState("");
			var copied = copyState[0], setCopied = copyState[1];
			var todayState = react.useState(null);
			var today = todayState[0], setToday = todayState[1];

			function fetchDay(day, offset) {
				setView(function (v) { return Object.assign({}, v, { loading: true, error: null, day: day }); });
				var day0 = dayStartAt(day);
				rpc("dsh-task-capsule/ledger", "query", { since: day0, until: day0 + 86400000, limit: 10, offset: offset || 0 }).then(function (data) {
					setView(function (v) {
						return {
							loading: false, error: null, day: day,
							records: offset ? v.records.concat(data.records || []) : (data.records || []),
							total: data.total || 0, summary: data.summary || null,
						};
					});
				}).catch(function (e) {
					setView(function (v) { return Object.assign({}, v, { loading: false, error: (e && e.message) || String(e) }); });
				});
			}

			function fetchToday() {
				// 收起时的摘要条也要有数：单独拉一次今天（服务端顺带返回 summary）
				var day0 = todayStart();
				rpc("dsh-task-capsule/ledger", "query", { since: day0, until: day0 + 86400000, limit: 1 }).then(function (data) {
					setToday(data.summary || null);
				}).catch(function (e) { /* 摘要拉不到就显示占位 */ });
			}

			react.useEffect(function () { fetchToday(); }, []);
			react.useEffect(function () { if (open && view.day === 0 && view.records.length === 0 && !view.loading) fetchDay(0, 0); }, [open]);

			function exportDay(fmt) {
				var day0 = dayStartAt(view.day);
				rpc("dsh-task-capsule/ledger", "export", { since: day0, until: day0 + 86400000 }).then(function (data) {
					var records = data.records || [];
					if (records.length === 0) return;
					var text = fmt === "csv" ? ledgerCsv(records) : ledgerJsonl(records);
					var d = new Date(day0);
					var tag = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
					var blob = new Blob([text], { type: fmt === "csv" ? "text/csv;charset=utf-8" : "application/x-ndjson" });
					var a = document.createElement("a");
					a.href = URL.createObjectURL(blob);
					a.download = "dsh-tasks-" + tag + "." + fmt;
					document.body.appendChild(a);
					a.click();
					a.remove();
					setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
				}).catch(function (e) {
					console.error("[dsh-task-capsule] export failed:", e && e.message);
				});
			}

			function copy(r) {
				var text = [
					r.title || tr("common.untitled"),
					endLabel(r.endReason),
					fmtDur(r.duration),
					(r.steps || 0) + tr("ledger.rowSteps") + (r.toolCalls || 0) + tr("ledger.rowTools"),
					r.approvalWaitMs ? tr("ledger.rowApprovalWait") + fmtDur(r.approvalWaitMs) : "",
				].filter(Boolean).join(tr("common.pipe"));
				try {
					if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
					else {
						var ta = document.createElement("textarea");
						ta.value = text;
						document.body.appendChild(ta);
						ta.select();
						document.execCommand("copy");
						ta.remove();
					}
					setCopied(r.recordId);
					setTimeout(function () { setCopied(""); }, 1500);
				} catch (e) { console.error("[dsh-task-capsule] copy failed:", e && e.message); }
			}

			// 摘要徽章：收起时也在，今天有多少一目了然
			var sum = today;
			var chips = [];
			if (sum && sum.count > 0) {
				chips.push({ t: sum.count + tr("ledger.summaryTasks"), c: "acc" });
				if (sum.durationMs > 0) chips.push({ t: fmtDur(sum.durationMs), c: "" });
				if (sum.approvalWaitMs > 0) chips.push({ t: tr("ledger.chipConfirm") + fmtDur(sum.approvalWaitMs), c: "warn" });
				if (sum.failures > 0) chips.push({ t: tr("ledger.chipFail") + sum.failures, c: "bad" });
				if (sum.interrupted > 0) chips.push({ t: tr("ledger.chipInterrupted") + sum.interrupted, c: "" });
			}

			var body = null;
			if (open && view.error) {
				body = h("div", { className: "pls-desc" },
					tr("ledger.readFailed") + view.error + " ",
					h("button", { type: "button", className: "pls-btn", onClick: function () { fetchDay(view.day, 0); } }, tr("ledger.retry")));
			} else if (open) {
				body = [
					h("div", { className: "pls-daynav" },
						h("button", { type: "button", className: "pls-btn", "aria-label": tr("ledger.prevDay"), onClick: function () { fetchDay(view.day + 1, 0); } }, "‹"),
						h("span", { className: "plb-chip" }, dayLabel(view.day)),
						h("button", {
							type: "button", className: "pls-btn", "aria-label": tr("ledger.nextDay"),
							disabled: view.day === 0,
							onClick: function () { fetchDay(Math.max(0, view.day - 1), 0); },
						}, "›"),
						h("span", { className: "pls-desc", style: { margin: "0", flex: "1" } }, summarizeLine(view.summary)),
						h("button", { type: "button", className: "pls-btn", onClick: function () { exportDay("csv"); } }, "CSV"),
						h("button", { type: "button", className: "pls-btn", onClick: function () { exportDay("jsonl"); } }, "JSONL")),
					view.records.map(function (r) {
						var isOpen = openId === r.recordId;
						return h("div", { key: r.recordId, className: "pls-entry" },
							h("button", {
								type: "button",
								className: "pls-entry-head",
								"aria-expanded": isOpen ? "true" : "false",
								onClick: function () { setOpenId(isOpen ? null : r.recordId); },
							},
								h("span", { className: "dot", style: { background: isSuccessEnd(r.endReason) ? "var(--pl-ok)" : (r.recovered ? "var(--pl-warn)" : "var(--pl-err)") } }),
								h("span", { className: "t" }, (r.title || tr("common.untitled")) + (r.recovered ? tr("ledger.recoveredTag") : "")),
								h("span", { className: "m" }, fmtDur(r.duration))),
							isOpen ? h("div", { className: "pls-entry-body" },
								h("div", null, tr("ledger.end") + endLabel(r.endReason) + (r.errorMessage ? " · " + truncate(r.errorMessage, 80) : "")),
								h("div", null, (r.steps || 0) + tr("ledger.rowStepsDot") + (r.toolCalls || 0) + tr("ledger.rowToolsLong") + (r.approvalCount ? " · " + r.approvalCount + tr("ledger.rowApprovals") + fmtDur(r.approvalWaitMs) : "")),
								r.models && r.models.length ? h("div", null, tr("ledger.models") + r.models.join(tr("common.listSep"))) : null,
								h("div", null, tr("ledger.start") + new Date(r.startTime || 0).toLocaleString() + tr("ledger.startEnd") + new Date(r.endTime || 0).toLocaleString()),
								h("button", { type: "button", className: "pls-btn", onClick: function () { copy(r); } }, copied === r.recordId ? tr("ledger.copied") : tr("ledger.copy"))) : null);
					}),
					(!view.loading && view.records.length === 0) ? h("div", { className: "pls-desc" }, (view.day === 0 ? tr("ledger.today") : dayLabel(view.day)) + tr("ledger.noRecords")) : null,
					view.records.length < view.total
						? h("button", { type: "button", className: "pls-btn", onClick: function () { fetchDay(view.day, view.records.length); } },
							view.loading ? tr("ledger.loading") : tr("ledger.loadMore") + (view.total - view.records.length) + tr("ledger.loadMoreClose"))
						: null,
				];
			}

			return h("div", { className: "pls-card pls-ledger-card" },
				h("button", {
					type: "button",
					className: "pls-ledger-bar",
					"aria-expanded": open ? "true" : "false",
					onClick: function () {
						var next = !open;
						setOpen(next);
						if (next && view.day === 0 && view.records.length === 0 && !view.loading) fetchDay(0, 0);
					},
				},
					h("span", { className: "plb-title" }, tr("ledger.title")),
					chips.length === 0 ? h("span", { className: "plb-sub" }, view.loading ? tr("ledger.reading") : tr("ledger.emptyToday")) : null,
					h("span", { style: { flex: "1" } }),
					h("span", { className: "plb-arrow", "aria-hidden": "true" }, open ? tr("ledger.collapse") : tr("ledger.expand"))),
				chips.length > 0 ? h("div", { className: "plb-chips" },
					chips.map(function (c2, i) {
						return h("span", { key: i, className: "plb-chip" + (c2.c ? " plb-chip-" + c2.c : "") }, c2.t);
					})) : null,
				body);
		}
		//#endregion

		//#region plugin body
		var inject = ["slots"];

		function apply(ctx) {
			ctxRef.current = ctx;
			ensureCss();
			// 语言：locale 是可选服务，可能比本插件晚挂载。先按浏览器语言兜底，
			// 服务一出现就接管；两处都拿不到才留在 zh（与旧版 DSH 的行为一致）。
			var localeSvc = null;
			var releaseLocale = null;

			function readLocale() {
				if (!localeSvc) return null;
				try {
					var snap = localeSvc.getLocale();
					return snap ? resolveLocaleTag(snap.active) : null;
				} catch (e) { return null; }
			}

			function browserLocale() {
				try {
					if (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) {
						return resolveLocaleTag(document.documentElement.lang);
					}
					if (typeof navigator !== "undefined" && navigator.language) return resolveLocaleTag(navigator.language);
				} catch (e) { /* 读不到就回 zh */ }
				return FALLBACK_LOCALE;
			}

			function applyLocale(next) {
				if (!next || next === activeLocale) return;
				activeLocale = next;
				// 三块 UI 共用同一个 store：emit 一次即整页换语言
				capsuleStore.emit();
			}

			function attachLocale() {
				var svc = typeof ctx.get === "function" ? ctx.get("locale") : undefined;
				if (!svc || typeof svc.getLocale !== "function") return false;
				localeSvc = svc;
				applyLocale(readLocale() || browserLocale());
				if (typeof svc.subscribe === "function" && !releaseLocale) {
					releaseLocale = svc.subscribe(function () {
						applyLocale(readLocale() || browserLocale());
					});
				}
				return true;
			}

			applyLocale(browserLocale());
			if (!attachLocale()) {
				var localeTries = 0;
				var localeTimer = setInterval(function () {
					localeTries++;
					if (attachLocale() || localeTries >= 40) clearInterval(localeTimer);
				}, 250);
				ctx.effect(function () {
					return function () { clearInterval(localeTimer); if (releaseLocale) releaseLocale(); };
				}, "dsh-task-capsule: locale");
			} else {
				ctx.effect(function () {
					return function () { if (releaseLocale) releaseLocale(); };
				}, "dsh-task-capsule: locale");
			}

			// runstate 全局轮询（胶囊/侧栏入口共享）；插件卸载时停止
			ctx.effect(function () { return startRunPolling(); }, "dsh-task-capsule: runstate polling");
			var slots = ctx.get("slots");
			if (slots === undefined) {
				console.error(tr("error.noSlots"));
				return;
			}

			// 任务胶囊：in-flow 挂会话 header 右侧 utilities 行（chrome 行，不遮消息区）
			slots.inject(PLATFORM.slots.capsule, function () { return slots.register(
				{ name: PLATFORM.slots.capsule, id: "dsh-task-capsule-capsule", order: 5, label: tr("slot.capsuleLabel") },
				function () { return h(Capsule, null); }); });

			// 通知卡栈：全局浮层
			slots.inject(PLATFORM.slots.overlay, function () { return slots.register(
				{ name: PLATFORM.slots.overlay, id: "dsh-task-capsule-overlay", order: 31, label: tr("slot.overlayLabel") },
				function () { return h(ToastStack, null); }); });

			// 设置页：通知行为配置
			slots.inject(PLATFORM.slots.settings, function () { return slots.register(
				{ name: PLATFORM.slots.settings, id: "dsh-task-capsule", order: 91, label: tr("slot.settingsLabel") },
				function () { return h(CapsuleSettings, null); }); });
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-task-capsule";
		return module.exports;
	}
});
