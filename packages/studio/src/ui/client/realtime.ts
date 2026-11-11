/**
 * Client runtime — Realtime: WebSocket and SSE testers with a live log.
 * Connections live in S.rt so they survive navigating between views.
 */
export const REALTIME = String.raw`
function rtConn(kind, ep) {
  var k = kind + ":" + ep.path;
  if (!S.rt[k]) S.rt[k] = { kind: kind, path: ep.path, events: ep.events || [], sock: null, state: "idle", log: [], paused: false, filter: "", auto: true, draft: kind === "ws" ? '{\n  "type": "ping"\n}' : "", ui: null };
  S.rt[k].events = ep.events || [];
  return S.rt[k];
}
function rtUrl(c) { var base = S.data.appUrl.replace(/\/$/, ""); return (c.kind === "ws" ? base.replace(/^http/, "ws") : base) + c.path }
function rtLog(c, dir, msg, ev) {
  var e = { t: Date.now(), dir: dir, msg: String(msg), ev: ev || null };
  c.log.push(e);
  if (c.log.length > 500) c.log.splice(0, c.log.length - 500);
  if (c.ui && document.contains(c.ui.log) && !c.paused) {
    if (rtMatch(c, e)) {
      var empty = $(".empty", c.ui.log); if (empty) empty.remove();
      c.ui.log.appendChild(rtEvNode(e));
      while (c.ui.log.children.length > 500) c.ui.log.removeChild(c.ui.log.firstChild);
      if (c.auto) c.ui.log.scrollTop = c.ui.log.scrollHeight;
    }
    c.ui.count();
  }
}
function rtMatch(c, e) { var f = c.filter.toLowerCase(); return !f || e.msg.toLowerCase().indexOf(f) >= 0 || (e.ev && e.ev.toLowerCase().indexOf(f) >= 0) }
function rtEvNode(e) {
  var icon = { in: "arrowDown", out: "arrowUp", sys: "dot", err: "alert" }[e.dir];
  var pretty = e.dir === "in" || e.dir === "out" ? prettyMaybe(e.msg) : null;
  return h("div", { class: "rt-ev " + e.dir },
    h("time", { text: clock(e.t) }),
    h("span", { class: "d", title: { in: "Received", out: "Sent", sys: "System", err: "Error" }[e.dir] }, ic(icon)),
    h("div", { class: "msg" }, e.ev ? h("span", { class: "evn", text: e.ev }) : null, pretty ? jsonNode(pretty) : e.msg));
}
function rtSetState(c, s, text) {
  c.state = s;
  if (c.ui && document.contains(c.ui.root)) c.ui.drawState(text);
}
function rtConnect(c) {
  if (c.sock) return;
  var url = rtUrl(c);
  rtSetState(c, "wait");
  rtLog(c, "sys", "Connecting to " + url + "…");
  try {
    if (c.kind === "ws") {
      var ws = new WebSocket(url);
      c.sock = ws;
      ws.onopen = function () { rtSetState(c, "on"); rtLog(c, "sys", "Connected") };
      ws.onmessage = function (e) { rtLog(c, "in", typeof e.data === "string" ? e.data : "<binary frame>") };
      ws.onerror = function () { rtLog(c, "err", "Connection error — is the app running at " + S.data.appUrl + "?") };
      ws.onclose = function (e) { c.sock = null; rtSetState(c, e.wasClean ? "idle" : "err"); rtLog(c, "sys", "Disconnected" + (e.code ? " (code " + e.code + (e.reason ? ", " + e.reason : "") + ")" : "")) };
    } else {
      var es = new EventSource(url);
      c.sock = es;
      es.onopen = function () { rtSetState(c, "on"); rtLog(c, "sys", "Stream open") };
      es.onmessage = function (e) { rtLog(c, "in", e.data, e.type !== "message" ? e.type : null) };
      (c.events || []).forEach(function (name) { if (name && name !== "message") es.addEventListener(name, function (e) { rtLog(c, "in", e.data, name) }) });
      es.onerror = function () {
        rtLog(c, "err", es.readyState === 0 && c.state === "on" ? "Stream interrupted" : "Stream error — is the app running and sending CORS headers?");
        es.close(); c.sock = null; rtSetState(c, "err");
      };
    }
  } catch (e) { c.sock = null; rtSetState(c, "err"); rtLog(c, "err", "Failed: " + e.message) }
}
function rtDisconnect(c) {
  if (!c.sock) return;
  var s = c.sock; c.sock = null;
  try { s.close() } catch (e) { /* ignore */ }
  rtSetState(c, "idle");
  if (c.kind === "sse") rtLog(c, "sys", "Stream closed");
}
function rtSend(c, text) {
  if (!c.sock || c.sock.readyState !== 1) { toast("Connect first", "warn"); return false }
  if (!text.trim()) { toast("Message is empty", "warn"); return false }
  c.sock.send(text); rtLog(c, "out", text); return true;
}

function rtCard(kind, ep) {
  var c = rtConn(kind, ep);
  var stateEl = h("span", { class: "rt-state" });
  var actBtn = h("span");
  var log = h("div", { class: "rt-log", role: "log", "aria-live": "polite", "aria-label": "Message log for " + ep.path });
  var countEl = h("span", { class: "muted num", style: "font-size:12px;white-space:nowrap" });
  var root = h("div", { class: "card rt-card" });
  c.ui = {
    root: root, log: log,
    count: function () { countEl.textContent = plural(c.log.length, "event") },
    drawState: function () {
      var map = { idle: ["", "Disconnected"], wait: ["wait", "Connecting…"], on: ["on", kind === "ws" ? "Connected" : "Listening"], err: ["err", "Error"] };
      var m = map[c.state] || map.idle;
      stateEl.className = "rt-state " + m[0];
      mount(stateEl, h("span", { class: "dot" }), m[1]);
      var live = c.state === "on" || c.state === "wait";
      mount(actBtn, live ? btn(kind === "ws" ? "Disconnect" : "Stop", { icon: "x", cls: "btn-sm", onclick: function () { rtDisconnect(c) } })
        : btn(kind === "ws" ? "Connect" : "Listen", { icon: "plug", cls: "btn-sm btn-primary", onclick: function () { rtConnect(c) } }));
    }
  };
  function drawLog() {
    var list = c.log.filter(function (e) { return rtMatch(c, e) });
    mount(log, list.length ? list.map(rtEvNode) : emptyState({ cls: "sm", icon: kind === "ws" ? "realtime" : "arrowDown", text: c.log.length ? "No events match the filter." : kind === "ws" ? "Connect, then send a message. Incoming frames appear here." : "Listen to start receiving server-sent events." }));
    if (c.auto) log.scrollTop = log.scrollHeight;
    c.ui.count();
  }
  var filter = h("input", { class: "input sm", type: "search", placeholder: "Filter log…", value: c.filter, "aria-label": "Filter log", spellcheck: "false" });
  filter.addEventListener("input", debounce(function () { c.filter = filter.value; drawLog() }, 120));
  var pauseBtn = iconBtn("pause", "Pause log", function () { c.paused = !c.paused; pauseBtn.classList.toggle("on", c.paused); pauseBtn.title = c.paused ? "Resume log" : "Pause log"; if (!c.paused) drawLog() }, "sm" + (c.paused ? " on" : ""));
  var autoBtn = iconBtn("arrowDown", "Auto-scroll", function () { c.auto = !c.auto; autoBtn.classList.toggle("on", c.auto); if (c.auto) log.scrollTop = log.scrollHeight }, "sm" + (c.auto ? " on" : ""));
  var logWrap = h("div", { class: "rt-log-wrap" },
    h("div", { class: "rt-log-bar" }, h("div", { class: "search" }, ic("search"), filter), h("span", { class: "sp" }), countEl, pauseBtn, autoBtn,
      iconBtn("eraser", "Clear log", function () { c.log = []; drawLog() }, "sm")),
    log);

  var compose = null;
  if (kind === "ws") {
    var ta = h("textarea", { class: "textarea", spellcheck: "false", "aria-label": "Message to send", placeholder: '{"type":"ping"}' });
    ta.value = c.draft;
    ta.addEventListener("input", function () { c.draft = ta.value });
    var send = function () { if (rtSend(c, ta.value)) { /* keep draft for quick resend */ } };
    ta.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send() } });
    var templates = (c.events.length ? c.events : ["ping"]).slice(0, 6);
    compose = h("div", { class: "rt-compose" },
      h("div", { class: "sect-h", style: "margin:0" }, "Message", h("span", { class: "sp" }),
        btn("Format JSON", { icon: "wand", cls: "btn-xs btn-ghost", onclick: function () { try { ta.value = JSON.stringify(JSON.parse(ta.value), null, 2); c.draft = ta.value } catch (e) { toast("Not valid JSON — sent as plain text", "warn") } } })),
      ta,
      h("div", { class: "chips" }, templates.map(function (ev) { return h("button", { type: "button", class: "chip", title: "Use template", onclick: function () { ta.value = JSON.stringify({ type: ev, data: {} }, null, 2); c.draft = ta.value; ta.focus() } }, ev) })),
      h("div", { class: "row" }, btn("Send", { icon: "send", cls: "btn-sm btn-primary", kbd: "Ctrl ↵", onclick: send }), h("span", { class: "sp" }), h("span", { class: "hint", text: "Text frame" })));
  }
  mount(root,
    h("div", { class: "card-h" },
      h("span", { class: "rt-kind " + kind, text: kind === "ws" ? "WS" : "SSE" }),
      h("span", { class: "path", style: "font-weight:600;flex:none", text: ep.path }),
      h("span", { class: "rt-url grow", text: rtUrl(c), title: rtUrl(c) }),
      stateEl, actBtn),
    (c.events.length ? h("div", { class: "row", style: "padding:8px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap" }, h("span", { class: "muted", style: "font-size:12px", text: "Events" }), h("div", { class: "rt-events" }, c.events.map(function (e) { return h("span", { class: "tag", text: e }) }))) : null),
    h("div", { class: "rt-body" + (compose ? "" : " single") }, compose, logWrap));
  c.ui.drawState(); drawLog();
  return root;
}

defineView("realtime", {
  title: "Realtime", icon: "realtime", key: "r",
  render: function (el) {
    if (!S.data) return overviewSkeleton(el);
    var ws = S.data.websockets, sse = S.data.sse;
    var live = Object.keys(S.rt).filter(function (k) { return S.rt[k].sock }).length;
    mount(el, h("div", { class: "page-inner" },
      pageHeader("Realtime", "Connect to WebSocket and Server-Sent Events endpoints and watch traffic live.", null, live ? badge(live + " live", "ok", "dot") : null),
      h("div", { class: "sec-h" }, ic("realtime", 14), "WebSockets", h("span", { class: "cnt", text: "· " + ws.length })),
      ws.length ? h("div", { class: "rt-list" }, ws.map(function (w) { return rtCard("ws", w) })) :
        h("div", { class: "card" }, emptyState({ icon: "realtime", title: "No WebSocket endpoints", text: rich("Create one with ", ["code", "new WSServer({ path: '/ws' })"], " from ", ["code", "@axiljs/websocket"], " and refresh — Studio detects it in ", ["code", "src/"], ".") })),
      h("div", { class: "sec-h" }, ic("arrowDown", 14), "Server-Sent Events", h("span", { class: "cnt", text: "· " + sse.length })),
      sse.length ? h("div", { class: "rt-list" }, sse.map(function (s) { return rtCard("sse", s) })) :
        h("div", { class: "card" }, emptyState({ icon: "arrowDown", title: "No SSE endpoints", text: rich("Stream events from a route handler with ", ["code", "createSSE(req, res)"], " from ", ["code", "@axiljs/core"], ", then refresh.") }))));
  }
});
`
