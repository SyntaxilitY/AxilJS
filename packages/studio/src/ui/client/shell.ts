/**
 * Client runtime — app shell: hash router, sidebar, breadcrumbs, theme,
 * data loading, command palette, keyboard shortcuts and boot.
 */
export const SHELL = String.raw`
var VIEWS = {};
var VIEW_ORDER = [];
var NAV_ORDER = ["overview", "endpoints", "database", "schema", "sql", "realtime", "export", "qr"];
function defineView(id, def) {
  VIEWS[id] = def; VIEW_ORDER.push(id);
  VIEW_ORDER.sort(function (a, b) { return NAV_ORDER.indexOf(a) - NAV_ORDER.indexOf(b) });
}

/* ── schema helpers ──────────────────────────────────── */
function allTables() {
  if (S.schema && S.schema.tables) return S.schema.tables;
  return (S.data && S.data.tables) || [];
}
function tableInfo(name) {
  var t = allTables().filter(function (x) { return x.name === name })[0];
  if (!t && S.data) t = S.data.tables.filter(function (x) { return x.name === name })[0];
  return t || null;
}
function fksOf(name) { var t = tableInfo(name); return (t && t.foreignKeys) || [] }
function incomingFks(name) {
  var out = [];
  allTables().forEach(function (t) { (t.foreignKeys || []).forEach(function (fk) { if (fk.refTable === name) out.push({ table: t.name, column: fk.column, refColumn: fk.refColumn }) }) });
  return out;
}
function fkMap(name) { var m = {}; fksOf(name).forEach(function (fk) { m[fk.column] = fk }); return m }
function gridColumns(name) {
  var t = tableInfo(name); var fks = fkMap(name);
  return ((t && t.columns) || []).map(function (c) { return { name: c.name, type: c.type, primary: c.primary, fk: fks[c.name] || null } });
}
function totalRows() { return allTables().reduce(function (a, t) { return a + (t.rowCount || 0) }, 0) }

/* ── router ──────────────────────────────────────────── */
function safeDecode(s) { try { return decodeURIComponent(s) } catch (e) { return s } }
function parseHash() {
  var raw = location.hash.replace(/^#\/?/, "");
  var q = {};
  var qi = raw.indexOf("?");
  if (qi >= 0) {
    raw.slice(qi + 1).split("&").forEach(function (p) {
      if (!p) return;
      var eq = p.indexOf("=");
      q[safeDecode(eq < 0 ? p : p.slice(0, eq))] = eq < 0 ? "" : safeDecode(p.slice(eq + 1).replace(/\+/g, " "));
    });
    raw = raw.slice(0, qi);
  }
  var parts = raw.split("/").filter(Boolean).map(safeDecode);
  return { view: parts[0] || "overview", parts: parts.slice(1), query: q };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash }
function replaceHash(hash) { try { history.replaceState(null, "", hash) } catch (e) { /* ignore */ } }

function setCrumbs(items) {
  var c = $("#crumbs"); if (!c) return;
  var appName = (S.data && S.data.appName) || BOOT.appName || "app";
  var nodes = [h("a", { class: "crumb-root mono", href: "#/overview", text: appName })];
  items.forEach(function (it, i) {
    nodes.push(h("span", { class: "sep" }, ic("chevronRight")));
    var last = i === items.length - 1;
    if (last || !it.href) nodes.push(h("span", { class: (last ? "cur" : "") + (it.mono ? " mono" : ""), text: it.label, title: it.label }));
    else nodes.push(h("a", { href: it.href, class: it.mono ? "mono" : "", text: it.label }));
  });
  mount(c, nodes);
  document.title = (items.length ? items[items.length - 1].label + " · " : "") + appName + " · Axil Studio";
}

function render() {
  closeAllOverlays();
  S.cleanup.forEach(function (fn) { try { fn() } catch (e) { /* ignore */ } });
  S.cleanup = [];
  var r = parseHash();
  var id = VIEWS[r.view] ? r.view : "overview";
  S.route = r;
  $$(".nav-item").forEach(function (a) {
    var on = a.getAttribute("data-view") === id;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.documentElement.classList.remove("sb-open");
  var def = VIEWS[id];
  var el = h("div", { class: "view " + (def.full ? "full" : "page"), id: "view-" + id, "data-view": id });
  mount($("#content"), el);
  setCrumbs([{ label: def.title }]);
  if (S.loadError && !S.data) { renderLoadError(el); return }
  try { def.render(el, r) } catch (e) {
    console.error(e);
    mount(el, emptyState({ cls: "err fill", icon: "error", title: "This view crashed", text: String(e && e.message || e) }));
  }
}
function renderLoadError(el) {
  el.className = "view page";
  mount(el, emptyState({
    cls: "err fill", icon: "plug", title: "Can't load Studio data",
    text: rich("The Studio API returned an error: ", ["code", S.loadError], ". Check the terminal running ", ["code", "axil run"], "."),
    action: btn("Try again", { icon: "refresh", cls: "btn-primary btn-sm", onclick: function () { refresh(true) } })
  }));
}

/* ── data loading ────────────────────────────────────── */
var loading = null;
function load() {
  if (loading) return loading;
  loading = Promise.all([
    getJSON("/api/studio/data"),
    getJSON("/api/studio/schema").catch(function () { return null })
  ]).then(function (res) {
    S.data = res[0]; S.schema = res[1]; S.schemaState = res[1] ? "ok" : "unavailable"; S.loadError = null;
    updateChrome();
  }).catch(function (e) {
    S.loadError = e.message || String(e);
    setConn("off", "Studio unreachable");
    throw e;
  }).finally(function () { loading = null });
  return loading;
}
function refresh(manual) {
  var b = $("#refresh-btn"); if (b) b.classList.add("spin");
  S.exp.cache = {};
  return load().then(function () {
    render(); probeApp();
    if (manual) toast("Data refreshed", "success");
  }, function (e) {
    render();
    if (manual) toast("Refresh failed: " + e.message, "error");
  }).finally(function () { if (b) setTimeout(function () { b.classList.remove("spin") }, 300) });
}
function updateChrome() {
  var d = S.data; if (!d) return;
  var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v };
  set("cnt-endpoints", d.routes.length);
  set("cnt-database", allTables().length);
  set("cnt-realtime", d.websockets.length + d.sse.length);
  set("sb-app", d.appName);
  var u = $("#conn-url"); if (u) { u.setAttribute("href", d.appUrl); $("span", u).textContent = d.appUrl.replace(/^https?:\/\//, "") }
}
function setConn(state, text) {
  var dot = $("#conn-dot"), t = $("#conn-text");
  if (dot) dot.className = "conn-dot " + state;
  if (t) t.textContent = text;
  var c = $("#conn"); if (c) c.title = text;
}
function probeApp() {
  if (!S.data) return;
  setConn("wait", "Checking app…");
  postJSON("/api/studio/proxy", { method: "GET", path: "/" })
    .then(function () { S.appOnline = true; setConn("on", "App running") })
    .catch(function (e) {
      if (e.status === 404) { S.appOnline = null; setConn("wait", "Studio connected"); return }
      S.appOnline = false; setConn("off", "App not running");
    });
}
function noteAppStatus(ok) { S.appOnline = ok; setConn(ok ? "on" : "off", ok ? "App running" : "App not running") }

/* ── theme + sidebar ─────────────────────────────────── */
function currentTheme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light" }
function setTheme(t, persist) {
  document.documentElement.setAttribute("data-theme", t);
  if (persist) store.set("theme", t);
  var b = $("#theme-btn");
  if (b) { mount(b, ic(t === "dark" ? "sun" : "moon")); b.title = t === "dark" ? "Switch to light theme" : "Switch to dark theme"; b.setAttribute("aria-label", b.title) }
  if (S.route.view === "schema" && S.er && S.er.redraw) S.er.redraw();
}
function toggleTheme() { setTheme(currentTheme() === "dark" ? "light" : "dark", true) }
function toggleSidebar() {
  if (window.matchMedia("(max-width: 767px)").matches) { document.documentElement.classList.toggle("sb-open"); return }
  var c = document.documentElement.classList.toggle("sb-collapsed");
  store.set("sb-collapsed", c);
}

/* ── command palette ─────────────────────────────────── */
function fuzzy(q, s) {
  if (!q) return { score: 0, idx: [] };
  var ls = s.toLowerCase(), lq = q.toLowerCase();
  var at = ls.indexOf(lq);
  if (at >= 0) {
    var idx = []; for (var i = 0; i < lq.length; i++) idx.push(at + i);
    return { score: 1000 - at * 2 - (ls.length - lq.length) * 0.5 + (at === 0 || /[\s\/._\-]/.test(ls.charAt(at - 1)) ? 200 : 0), idx: idx };
  }
  var j = 0, score = 0, prev = -2, out = [];
  for (var k = 0; k < ls.length && j < lq.length; k++) {
    if (lq.charAt(j) === " ") { j++; k--; continue }
    if (ls.charAt(k) === lq.charAt(j)) {
      out.push(k);
      score += k === prev + 1 ? 12 : (k === 0 || /[\s\/._\-]/.test(ls.charAt(k - 1)) ? 8 : 1);
      prev = k; j++;
    }
  }
  return j === lq.length ? { score: score - ls.length * 0.2, idx: out } : null;
}
function paletteItems() {
  var items = [];
  VIEW_ORDER.forEach(function (id) {
    var v = VIEWS[id];
    items.push({ group: "Go to", label: v.title, icon: v.icon, hint: v.key ? "g " + v.key : "", run: function () { go("#/" + id) } });
  });
  items.push(
    { group: "Actions", label: "Toggle theme", icon: currentTheme() === "dark" ? "sun" : "moon", hint: "", run: toggleTheme },
    { group: "Actions", label: "Refresh data", icon: "refresh", run: function () { refresh(true) } },
    { group: "Actions", label: "Toggle sidebar", icon: "sidebar", hint: "[", run: toggleSidebar },
    { group: "Actions", label: "New SQL query", icon: "sql", run: function () { go("#/sql") } },
    { group: "Actions", label: "Download Postman collection", icon: "download", run: function () { exportDownload("postman") } },
    { group: "Actions", label: "Download Insomnia collection", icon: "download", run: function () { exportDownload("insomnia") } },
    { group: "Actions", label: "Download OpenAPI spec", icon: "download", run: function () { exportDownload("openapi") } },
    { group: "Actions", label: "Copy app URL", icon: "link", run: function () { copyText(S.data ? S.data.appUrl : BOOT.appUrl, "App URL copied") } },
    { group: "Actions", label: "Keyboard shortcuts", icon: "keyboard", hint: "?", run: showShortcuts }
  );
  allTables().forEach(function (t) {
    items.push({ group: "Tables", label: t.name, icon: "table", hint: plural(t.rowCount || 0, "row"), mono: true, run: function () { go(dbHash(t.name)) } });
    items.push({ group: "Tables", label: t.name + " › structure", icon: "columns", hint: "", mono: true, extra: true, run: function () { go(dbHash(t.name, null, "structure")) } });
  });
  ((S.data && S.data.routes) || []).forEach(function (r) {
    items.push({ group: "Endpoints", label: r.method + " " + r.path, icon: "endpoints", method: r.method, path: r.path, mono: true, run: function () { go(epHash(r)) } });
  });
  return items;
}
function openPalette() {
  if ($(".palette")) return;
  var all = paletteItems();
  var sel = 0, shown = [];
  var input = h("input", { type: "text", placeholder: "Search views, tables, endpoints, actions…", "aria-label": "Command search", spellcheck: "false", autocomplete: "off" });
  var list = h("div", { class: "pal-list", role: "listbox" });
  function draw() {
    var q = input.value.trim();
    var res;
    if (!q) {
      var caps = { "Go to": 99, Actions: 99, Tables: 6, Endpoints: 8 }, counts = {};
      res = all.filter(function (it) { if (it.extra) return false; counts[it.group] = (counts[it.group] || 0) + 1; return counts[it.group] <= caps[it.group] }).map(function (it) { return { it: it, m: { idx: [] } } });
    } else {
      res = all.map(function (it) { var m = fuzzy(q, it.label); return m ? { it: it, m: m } : null }).filter(Boolean)
        .sort(function (a, b) { return b.m.score - a.m.score }).slice(0, 40);
      var order = ["Go to", "Tables", "Endpoints", "Actions"];
      var best = {};
      res.forEach(function (r) { if (best[r.it.group] == null) best[r.it.group] = r.m.score });
      order.sort(function (a, b) { return (best[b] == null ? -1e9 : best[b]) - (best[a] == null ? -1e9 : best[a]) });
      res.sort(function (a, b) { return order.indexOf(a.it.group) - order.indexOf(b.it.group) || b.m.score - a.m.score });
    }
    shown = res;
    if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
    var nodes = [], g = null;
    if (!shown.length) nodes.push(emptyState({ cls: "sm", icon: "search", title: "No results", text: "Try a table name, a path like /users, or an action." }));
    shown.forEach(function (r, i) {
      if (r.it.group !== g) { g = r.it.group; nodes.push(h("div", { class: "pal-g", text: g })) }
      var lb = h("span", { class: "lb" + (r.it.mono ? " mono" : "") });
      var idx = {}; r.m.idx.forEach(function (x) { idx[x] = 1 });
      var text = r.it.label, buf = "", on = false, start = r.it.method ? r.it.method.length + 1 : 0;
      var flush = function () { if (!buf) return; lb.appendChild(on ? h("mark", { text: buf }) : document.createTextNode(buf)); buf = "" };
      for (var k = start; k < text.length; k++) { var hit = !!idx[k]; if (hit !== on) { flush(); on = hit } buf += text.charAt(k) }
      flush();
      nodes.push(h("button", {
        type: "button", class: "pal-it" + (i === sel ? " on" : ""), role: "option", "aria-selected": i === sel ? "true" : "false", "data-i": i,
        onmousemove: function () { if (sel !== i) { sel = i; mark() } },
        onclick: function () { choose(i) }
      }, r.it.method ? methodPill(r.it.method, true) : ic(r.it.icon || "arrowRight"), lb, r.it.hint ? h("span", { class: "ht", text: r.it.hint }) : null));
    });
    mount(list, nodes);
  }
  function mark() {
    $$(".pal-it", list).forEach(function (b) { var on = Number(b.getAttribute("data-i")) === sel; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); if (on) b.scrollIntoView({ block: "nearest" }) });
  }
  function choose(i) { var r = shown[i]; if (!r) return; m.close(); r.it.run() }
  input.addEventListener("input", function () { sel = 0; draw() });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark() }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark() }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel) }
  });
  var body = h("div", { class: "palette" }, h("div", { class: "pal-in" }, ic("search"), input, kbd("Esc")), list,
    h("div", { class: "pal-foot" }, h("span", null, kbd("↑"), kbd("↓"), " navigate"), h("span", null, kbd("↵"), " open"), h("span", null, kbd("Esc"), " close")));
  var m = openModal(null, body, null, { width: 620 });
  draw();
  input.focus();
}

function showShortcuts() {
  var mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  var row = function (label, keys) { return h("div", null, h("span", { text: label }), h("span", { class: "kk" }, keys.map(kbd))) };
  var body = h("div", { class: "modal-b" }, h("div", { class: "keys" },
    h("h4", { text: "General" }),
    row("Command palette", [mod, "K"]), row("Command palette", ["/"]),
    row("Keyboard shortcuts", ["?"]), row("Toggle sidebar", ["["]),
    row("Close dialog / drawer", ["Esc"]), row("Toggle theme", ["t"]),
    h("h4", { text: "Navigation" }),
    row("Overview", ["g", "o"]), row("Endpoints", ["g", "e"]),
    row("Database", ["g", "d"]), row("Schema diagram", ["g", "s"]),
    row("SQL console", ["g", "q"]), row("Realtime", ["g", "r"]),
    row("Export", ["g", "x"]), row("QR access", ["g", "c"]),
    h("h4", { text: "Editors" }),
    row("Send request / run query", [mod, "Enter"]), row("Send WebSocket message", [mod, "Enter"]),
    row("Copy a cell", ["double-click"]), row("Open row details", ["click"])
  ));
  openModal("Keyboard shortcuts", body, null, { width: 640 });
}

/* ── keyboard ────────────────────────────────────────── */
var gPending = 0;
function onKey(e) {
  var mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === "k" || e.key === "K")) { e.preventDefault(); if ($(".palette")) closeTopOverlay(); else openPalette(); return }
  if (e.key === "Escape") { if (closeTopOverlay()) { e.preventDefault(); return } if (document.documentElement.classList.contains("sb-open")) { document.documentElement.classList.remove("sb-open"); return } }
  if (isTyping(e) || mod || e.altKey) return;
  if (OVERLAYS.length) return;
  if (gPending && Date.now() - gPending < 1200) {
    gPending = 0;
    var map = {};
    VIEW_ORDER.forEach(function (id) { if (VIEWS[id].key) map[VIEWS[id].key] = id });
    if (map[e.key]) { e.preventDefault(); go("#/" + map[e.key]) }
    return;
  }
  if (e.key === "/") { e.preventDefault(); openPalette() }
  else if (e.key === "?") { e.preventDefault(); showShortcuts() }
  else if (e.key === "[") { e.preventDefault(); toggleSidebar() }
  else if (e.key === "t") { toggleTheme() }
  else if (e.key === "g") { gPending = Date.now() }
}

/* ── boot ────────────────────────────────────────────── */
function boot() {
  setTheme(currentTheme(), false);
  $("#theme-btn").addEventListener("click", toggleTheme);
  $("#refresh-btn").addEventListener("click", function () { refresh(true) });
  $("#palette-btn").addEventListener("click", openPalette);
  $("#menu-btn").addEventListener("click", toggleSidebar);
  $("#collapse-btn").addEventListener("click", toggleSidebar);
  $("#expand-btn").addEventListener("click", toggleSidebar);
  $("#backdrop").addEventListener("click", function () { document.documentElement.classList.remove("sb-open") });
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", render);
  try {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onSys = function () { if (!store.get("theme", null) && !/[?&]theme=/.test(location.search)) setTheme(mq.matches ? "dark" : "light", false) };
    if (mq.addEventListener) mq.addEventListener("change", onSys);
  } catch (e) { /* old browsers */ }
  render();
  load().then(function () { render(); probeApp() }, function () { render() });
  setInterval(function () {
    if (document.hidden || loading) return;
    var before = S.data ? JSON.stringify([S.data.routes.length, S.data.tables.map(function (t) { return t.name + t.rowCount }), S.data.websockets.length, S.data.sse.length]) : "";
    load().then(function () {
      var after = JSON.stringify([S.data.routes.length, S.data.tables.map(function (t) { return t.name + t.rowCount }), S.data.websockets.length, S.data.sse.length]);
      if (before !== after && S.route.view === "overview" && !OVERLAYS.length) render();
    }, function () { /* keep last good data */ });
  }, 30000);
}
`
