/**
 * dsh-pilot — 浏览器半部（手写 __ModuleLoader__ bundle，无构建链，勿用 JSX）。
 *
 * 两块 UI：
 *  1. 运行任务胶囊（in-flow 挂会话 header 右侧 utilities 行）：「N 个任务 · 耗时」，
 *     圆点颜色=阶段；点击跳转对应会话（多任务/空闲展开下拉列表点选，Esc 关闭）。
 *  2. 任务通知卡栈（shell.overlay 全局浮层，portal 进会话 pane 避开右栏）：
 *     完成/出错/需确认卡片 + 提示音 + 可选系统通知；显式「前往会话」按钮跳转（防误触）。
 * 设置页（settings.section）：通知行为开关。
 * 不含 token 统计（DSH 自带会话统计条已给 token/缓存命中；费用估算按用户裁决移除）。
 *
 * Host 通信：fetch('/dsh-pilot/runstate/status' | '/dsh-pilot/notify/status|config')。
 * 跳转会话：uiWorkspace.openSession（含跨工作区切换），回退 sessions.open。
 */
window.__ModuleLoader__.load({
	id: "dsh-pilot",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var react = require("react");
		var reactDom = require("react-dom");
		var h = react.createElement;

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
			".plp-pop-head{padding:6px 10px 4px;font-size:11px;color:var(--dsw-alias-label-tertiary,#888);}",
			".plp-item{display:flex;align-items:center;gap:8px;border:none;background:transparent;border-radius:8px;padding:7px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#111);text-align:left;}",
			".plp-item:hover{background:color-mix(in srgb,var(--pl-accent) 8%,transparent);}",
			".plp-item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}",
			".plp-item .m{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#888);}",
			".plp-item .dot{flex:none;width:7px;height:7px;border-radius:50%;}",
			// ---- 通知卡栈 ----
			".pln-stack{position:absolute;top:10px;right:10px;z-index:320;display:flex;flex-direction:column;gap:8px;width:340px;max-width:calc(100vw - 28px);pointer-events:none;}",
			".pln-stack.pln-fixed{position:fixed;top:14px;right:14px;}",
			".pln-toast{pointer-events:auto;position:relative;border:1px solid var(--dsw-alias-border-l1,#ddd);border-left:3px solid var(--pl-ok);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);border-radius:12px;box-shadow:0 10px 32px rgb(0 0 0 / .16);padding:10px 30px 10px 12px;cursor:pointer;animation:pl-in .18s ease-out;}",
			".pln-toast.err{border-left-color:var(--pl-err);}",
			".pln-toast.warn{border-left-color:var(--pl-warn);}",
			"@keyframes pl-in{from{opacity:0;transform:translateX(12px);}to{opacity:1;transform:none;}}",
			".pln-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".pln-meta{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-tertiary,#888);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
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
			".pls-row{display:flex;align-items:center;gap:10px;}",
			".pls-label{flex:1;}",
			".pls-desc{color:var(--dsw-alias-label-tertiary,#888);font-size:11px;margin-top:2px;}",
			".pls-sw{flex:none;position:relative;width:34px;height:19px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#ccc);background:var(--dsw-alias-bg-layer-2,#f4f4f4);cursor:pointer;padding:0;transition:background .18s,border-color .18s;}",
			".pls-sw::after{content:\"\";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgb(0 0 0 / .35);transition:transform .18s;}",
			".pls-sw.on{background:var(--pl-ok);border-color:transparent;}",
			".pls-sw.on::after{transform:translateX(15px);}",
			".pls-sel{flex:none;border:1px solid var(--dsw-alias-border-l2,#ccc);background:var(--dsw-alias-bg-layer-2,#f4f4f4);color:var(--dsw-alias-label-primary,#111);border-radius:8px;padding:3px 8px;font-family:inherit;font-size:12px;}",
		].join("\n");

		var cssTag = null;
		function ensureCss() {
			if (typeof document === "undefined") return;
			try {
				if (!cssTag || !cssTag.isConnected) {
					cssTag = document.querySelector('style[data-plugin-css="dsh-pilot"]');
					if (!cssTag) {
						cssTag = document.createElement("style");
						cssTag.dataset.pluginCss = "dsh-pilot";
						document.head.appendChild(cssTag);
					}
				}
				cssTag.textContent = CSS;
			} catch (e) { /* 样式注入失败只降级 */ }
		}
		//#endregion

		//#region helpers
		function rpc(prefix, method, args) {
			return fetch("/" + prefix + "/" + method, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(args === undefined ? {} : args),
			}).then(function (res) {
				return res.json().catch(function () { return {}; }).then(function (data) {
					if (res.ok && data && data.ok === true) return data.data;
					throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
				});
			});
		}

		var PHASE_LABELS = { think: "思考中", write: "输出中", code: "编写代码", search: "查资料" };
		function phaseLabel(p) { return PHASE_LABELS[p] || "工作中"; }
		var PHASE_COLORS = { think: "#2f6fed", write: "#0d9488", code: "#b45309", search: "#0e7490" };
		function phaseColor(p) { return PHASE_COLORS[p] || "#2f6fed"; }
		var END_LABELS = {
			completed: "完成", error: "出错", aborted: "已中止",
			blocked: "受阻", "max-tokens": "达输出上限", interrupted: "中断",
		};
		function endLabel(r) { return END_LABELS[r] || "完成"; }
		function isSuccessEnd(r) { return !r || r === "completed"; }

		function fmtCompact(n) {
			n = Number(n) || 0;
			if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
			return String(Math.round(n));
		}
		function fmtClock(ms) {
			var s = Math.max(0, Math.floor((ms || 0) / 1000));
			var hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
			function p(x) { return String(x).padStart(2, "0"); }
			return hh > 0 ? hh + ":" + p(m) + ":" + p(sec) : p(m) + ":" + p(sec);
		}
		function fmtDur(ms) {
			var s = Math.max(0, Math.round((ms || 0) / 1000));
			var hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
			if (hh > 0) return hh + "小时" + m + "分" + sec + "秒";
			if (m > 0) return m + "分" + sec + "秒";
			return sec + "秒";
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

		function systemNotify(title, body, tag) {
			try {
				if (typeof window === "undefined" || !("Notification" in window)) return;
				if (Notification.permission !== "granted") return;
				new Notification(title, { body: body, tag: tag });
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
				emit: function () { for (var fn of this.listeners) fn(); },
				refresh: function () {
					var self = this;
					if (self.loading) return Promise.resolve();
					self.loading = true;
					return fetcher().then(function (data) {
						self.snap = data; self.error = null; self.loading = false; self.emit();
					}).catch(function (e) {
						self.error = (e && e.message) || String(e); self.loading = false; self.emit();
					});
				},
			};
		}
		var runStore = makeStore(function () { return rpc("dsh-pilot/runstate", "status"); });
		var notifyStore = makeStore(function () { return rpc("dsh-pilot/notify", "status"); });

		function useStore(store) {
			var state = react.useState(0);
			var bump = state[1];
			react.useEffect(function () {
				return store.subscribe(function () { bump(function (n) { return n + 1; }); });
			}, [store]);
			return store;
		}
		// 轮询驱动：overlay 挂载期间常驻
		function usePolling(store, intervalOf) {
			react.useEffect(function () {
				var stopped = false;
				var timer = null;
				function loop() {
					store.refresh().then(function () {
						if (stopped) return;
						timer = setTimeout(loop, intervalOf(store));
					});
				}
				loop();
				return function () { stopped = true; if (timer) clearTimeout(timer); };
			}, [store]);
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
				console.error("[dsh-pilot] open session failed:", e && e.message);
			}
		}

		// 会话 pane 容器（与 MCP 徽标同坐标系）：通知卡栈的 portal 目标，右栏展开不压面板
		function useConversationPane() {
			var state = react.useState(null);
			var el = state[0], setEl = state[1];
			react.useEffect(function () {
				function find() {
					var node = document.querySelector('[data-pane="conversation"]');
					setEl(node && node.isConnected ? node : null);
					return !!node;
				}
				if (find()) return;
				var t = setInterval(function () { if (find()) clearInterval(t); }, 800);
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

		// 任务列表条目（胶囊下拉与侧栏入口下拉共用）
		function taskListNodes(active, recent, pick) {
			var items = active.length > 0 ? active : recent;
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
					h("span", { className: "t" }, t.title || "(无标题)"),
					h("span", { className: "m" }, isAct ? phaseLabel(t.phase) + " " + fmtClock(t.elapsed) : endLabel(t.endReason) + " " + fmtDur(t.duration)));
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
			var waiting = active.reduce(function (n, t) { return n + (Array.isArray(t.approvals) ? t.approvals.length : 0); }, 0);

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
				txt = "✋ " + waiting + " 待确认" + (active.length > 1 ? " · " + active.length + " 任务" : "");
				title = active.length === 1 ? "点击跳转等待确认的会话" : "点击展开任务列表";
			} else if (active.length > 0) {
				cls += " plp-run";
				var newest = active.slice().sort(function (a, b) { return b.startTime - a.startTime; })[0];
				var elapsed = active.reduce(function (m, t) { return Math.max(m, t.elapsed || 0); }, 0);
				txt = active.length + " 个任务 · " + fmtClock(elapsed);
				dotColor = phaseColor(newest.phase);
				title = (active.length === 1 ? "点击跳转对应会话" : "点击展开任务列表") + " · " + phaseLabel(newest.phase);
			} else {
				// 空闲占位：头部位置稳定，明确「当前无任务」；点击仍可翻最近完成
				cls += " plp-idle";
				txt = "空闲 · 无任务";
				title = recent.length > 0 ? "空闲 · 点击展开最近完成" : "暂无任务记录";
			}

			function handleClick() {
				if (active.length === 1) { openSession(active[0].sessionId); return; }
				setPopOpen(function (v) { return !v; });
			}

			return h("span", { className: "plp-wrap" },
				h("button", {
					type: "button",
					ref: pillRef,
					className: cls,
					onClick: handleClick,
					title: title,
					"aria-haspopup": "true",
					"aria-expanded": popOpen,
				},
					h("span", { className: "plp-dot", style: dotColor ? { background: dotColor } : null }),
					txt ? h("span", { className: "plp-txt" }, txt) : null),
				popOpen ? h("div", { ref: popRef, className: "plp-pop", role: "menu" },
					h("div", { className: "plp-pop-head" }, active.length > 0 ? "进行中任务 · 点击跳转" : "最近完成 · 点击跳转"),
					(active.length + recent.length) > 0
						? taskListNodes(active, recent, function (sid) { setPopOpen(false); openSession(sid); })
						: h("div", { className: "plp-pop-head" }, "暂无任务记录")) : null);
		}
		//#endregion

		//#region 通知卡栈
		function ToastStack(props) {
			var store = useStore(notifyStore);
			var pane = useConversationPane();
			usePolling(notifyStore, function (s) {
				var st2 = s.snap;
				if (s.error) return 15000;
				return st2 && st2.active && st2.active.length > 0 ? 2000 : 4000;
			});
			var toastsState = react.useState([]);
			var toasts = toastsState[0], setToasts = toastsState[1];
			var seenDoneRef = react.useRef(null); // Set(key)；首帧初始化避免补弹历史
			var seenAprRef = react.useRef(new Set());
			var timersRef = react.useRef(new Map());

			var st = store.snap;
			var cfg = (st && st.config) || {};

			react.useEffect(function () {
				if (!st) return;
				if (!seenDoneRef.current) {
					seenDoneRef.current = new Set((st.recent || []).map(function (r) { return r.sessionId + ":" + r.endTime; }));
					return;
				}
				var added = [];
				// 完成/出错
				for (var r of (st.recent || [])) {
					var key = r.sessionId + ":" + r.endTime;
					if (seenDoneRef.current.has(key)) continue;
					seenDoneRef.current.add(key);
					if (seenDoneRef.current.size > 500) seenDoneRef.current = new Set(Array.from(seenDoneRef.current).slice(-200));
					var ok = isSuccessEnd(r.endReason);
					if (ok ? cfg.notifyOnComplete === false : cfg.notifyOnError === false) continue;
					added.push({
						id: key,
						kind: ok ? "done" : "error",
						title: (ok ? "✅ 完成：" : "❌ " + endLabel(r.endReason) + "：") + (r.title || "(无标题)"),
						meta: fmtDur(r.duration) + " · ↧" + fmtCompact(r.inputTokens) + " ↥" + fmtCompact(r.outputTokens) + (r.errorMessage ? " · " + truncate(r.errorMessage, 60) : ""),
						sessionId: r.sessionId,
					});
					if (cfg.soundNotify !== false) playSound(cfg.soundEffect, ok ? "ok" : "error");
					if (cfg.systemNotify && typeof document !== "undefined" && document.hidden) {
						systemNotify((ok ? "✅ dsh 任务完成" : "❌ dsh 任务" + endLabel(r.endReason)), (r.title || "") + " · " + fmtDur(r.duration), "dsh-pilot-" + key);
					}
				}
				// 等待确认
				if (cfg.notifyOnConfirm !== false) {
					for (var t of (st.active || [])) {
						for (var a of (t.approvals || [])) {
							var akey = t.sessionId + ":" + a.id;
							if (seenAprRef.current.has(akey)) continue;
							seenAprRef.current.add(akey);
							added.push({
								id: akey,
								kind: "confirm",
								title: "✋ 等待确认：" + (a.toolName || "工具"),
								meta: truncate(a.reason || t.title || "", 80),
								sessionId: t.sessionId,
							});
							if (cfg.soundNotify !== false) playSound("ding", "ok");
							if (cfg.systemNotify && typeof document !== "undefined" && document.hidden) {
								systemNotify("✋ dsh 任务等待确认", (a.toolName || "") + " · " + truncate(t.title || "", 60), "dsh-pilot-" + akey);
							}
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

			if (toasts.length === 0) return null;
			// 卡片本体不可点（防误触）：跳转走显式「前往会话」按钮
			var stackNode = h("div", { className: "pln-stack" + (pane ? "" : " pln-fixed"), "aria-live": "polite" }, toasts.map(function (t) {
				return h("div", {
					key: t.id,
					className: "pln-toast" + (t.kind === "error" ? " err" : t.kind === "confirm" ? " warn" : ""),
				},
					h("div", { className: "pln-title" }, t.title),
					h("div", { className: "pln-meta" }, t.meta),
					h("div", { className: "pln-foot" },
						h("button", {
							type: "button",
							className: "pln-go",
							"aria-label": "前往对应会话",
							onClick: function () { dismiss(t.id); openSession(t.sessionId); },
						}, "前往会话 →")),
					h("button", {
						type: "button",
						className: "pln-close",
						"aria-label": "关闭",
						onClick: function () { dismiss(t.id); },
					}, "✕"));
			}));
			return pane ? reactDom.createPortal(stackNode, pane) : stackNode;
		}
		//#endregion

		//#region 设置页
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
					onClick: props.onToggle,
				}));
		}

		function PilotSettings() {
			var store = useStore(notifyStore);
			react.useEffect(function () { if (!store.snap) store.refresh(); }, [store]);
			var cfg = (store.snap && store.snap.config) || null;
			function patch(obj) {
				rpc("dsh-pilot/notify", "config", obj).then(function () { return store.refresh(); }).catch(function (e) {
					console.error("[dsh-pilot] save notify config failed:", e && e.message);
				});
			}
			if (!cfg) return h("div", { className: "pls-root" }, h("div", { className: "pls-intro" }, "正在读取通知配置…"));
			return h("div", { className: "pls-root" },
				h("div", { className: "pls-intro" },
					"dsh-pilot · 驾驶舱两件套：会话 header 任务胶囊（圆点颜色分态、点击跳转会话）、任务通知（显式按钮跳转会话）。",
					"Token 统计用 DSH 自带会话统计条即可，本插件不重复做。三功能常开、无独立开关；此处只配置通知行为。",
					"配置持久化在 settings 的 dsh-pilot 命名空间（首启动已从 dsh-dock 只读迁移旧值）。"),
				h("div", { className: "pls-card" },
					h(SwitchRow, {
						label: "完成通知", desc: "任务正常结束时弹卡片",
						on: cfg.notifyOnComplete !== false,
						onToggle: function () { patch({ notifyOnComplete: cfg.notifyOnComplete === false }); },
					}),
					h(SwitchRow, {
						label: "异常通知", desc: "任务出错/中止/受阻时弹卡片",
						on: cfg.notifyOnError !== false,
						onToggle: function () { patch({ notifyOnError: cfg.notifyOnError === false }); },
					}),
					h(SwitchRow, {
						label: "需确认通知", desc: "工具等待批准时提醒",
						on: cfg.notifyOnConfirm !== false,
						onToggle: function () { patch({ notifyOnConfirm: cfg.notifyOnConfirm === false }); },
					}),
					h(SwitchRow, {
						label: "提示音", desc: "WebAudio 合成，无音频文件",
						on: cfg.soundNotify !== false,
						onToggle: function () { patch({ soundNotify: cfg.soundNotify === false }); },
					}),
					h(SwitchRow, {
						label: "浏览器系统通知", desc: "页面在后台时推送（开启时请求授权）",
						on: !!cfg.systemNotify,
						onToggle: function () {
							var next = !cfg.systemNotify;
							if (next && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
								Notification.requestPermission();
							}
							patch({ systemNotify: next });
						},
					}),
					h("div", { className: "pls-row" },
						h("div", { className: "pls-label" }, h("div", null, "卡片停留时长")),
						h("select", {
							className: "pls-sel",
							value: String(Number.isFinite(cfg.notifyStayMs) ? cfg.notifyStayMs : 8000),
							onChange: function (e) { patch({ notifyStayMs: Number(e.target.value) }); },
						},
							h("option", { value: "5000" }, "5 秒"),
							h("option", { value: "8000" }, "8 秒"),
							h("option", { value: "15000" }, "15 秒"),
							h("option", { value: "30000" }, "30 秒"),
							h("option", { value: "0" }, "常驻直到手动关闭"))),
					h("div", { className: "pls-row" },
						h("div", { className: "pls-label" }, h("div", null, "完成提示音音效")),
						h("select", {
							className: "pls-sel",
							value: cfg.soundEffect || "chime",
							onChange: function (e) { patch({ soundEffect: e.target.value }); },
						},
							h("option", { value: "chime" }, "chime（双音）"),
							h("option", { value: "ding" }, "ding（单音）")))));
		}
		//#endregion

		//#region plugin body
		var inject = ["slots"];

		function apply(ctx) {
			ctxRef.current = ctx;
			ensureCss();
			// runstate 全局轮询（胶囊/侧栏入口共享）；插件卸载时停止
			ctx.effect(function () { return startRunPolling(); }, "dsh-pilot: runstate polling");
			var slots = ctx.get("slots");
			if (slots === undefined) return;

			// 任务胶囊：in-flow 挂会话 header 右侧 utilities 行（chrome 行，不遮消息区）
			slots.inject("conversation.session.header.utilities", function () { return slots.register(
				{ name: "conversation.session.header.utilities", id: "dsh-pilot-capsule", order: 5, label: "dsh-pilot 任务胶囊" },
				function () { return h(Capsule, null); }); });

			// 通知卡栈：全局浮层
			slots.inject("shell.overlay", function () { return slots.register(
				{ name: "shell.overlay", id: "dsh-pilot-overlay", order: 31, label: "dsh-pilot 通知卡栈" },
				function () { return h(ToastStack, null); }); });

			// 设置页：通知行为配置
			slots.inject("settings.section", function () { return slots.register(
				{ name: "settings.section", id: "dsh-pilot", order: 91, label: "dsh-pilot" },
				function () { return h(PilotSettings, null); }); });
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-pilot";
		return module.exports;
	}
});
