/**
 * Client runtime — core: state, DOM helpers, storage, API, overlays, toasts,
 * cell/JSON/SQL rendering helpers shared by every view.
 *
 * Authored as plain browser JS inside String.raw (so regex backslashes stay
 * literal). Rules for every client module: no backticks, no dollar-brace, no
 * closing script tag, and never assign untrusted data to innerHTML — build
 * nodes with h() so text is always set through textContent.
 */
export const CORE = String.raw`
var BOOT = {};
try { BOOT = JSON.parse(document.getElementById("studio-boot").textContent || "{}") } catch (e) { BOOT = {} }
var ICONS = BOOT.icons || {};
var SVGNS = "http://www.w3.org/2000/svg";
var LS = "axil-studio:";
var METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
var BODY_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

var S = {
  data: null,
  schema: null,
  schemaState: "idle",
  loadError: null,
  route: { view: "overview", parts: [], query: {} },
  appOnline: null,
  cleanup: [],
  db: {},
  ep: { q: "", method: "ALL", closed: {}, drafts: {}, resp: {}, tab: {}, rtab: "body", busy: {} },
  sql: null,
  rt: {},
  er: null,
  exp: { tab: "routes", cache: {} }
};

/* ── storage ─────────────────────────────────────────── */
var store = {
  get: function (k, d) {
    try { var v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v) } catch (e) { return d }
  },
  set: function (k, v) {
    try { localStorage.setItem(LS + k, JSON.stringify(v)) } catch (e) { /* private mode */ }
  },
  del: function (k) { try { localStorage.removeItem(LS + k) } catch (e) { /* ignore */ } }
};

/* ── DOM ─────────────────────────────────────────────── */
function $(sel, root) { return (root || document).querySelector(sel) }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)) }

function h(tag, props) {
  var svg = tag.indexOf("svg:") === 0;
  var el = svg ? document.createElementNS(SVGNS, tag.slice(4)) : document.createElement(tag);
  if (props) {
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "text") el.textContent = String(v);
      else if (k === "style") el.setAttribute("style", v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "readOnly") el[k] = !!v;
      else if (k === "dataset") { for (var d in v) el.dataset[d] = v[d] }
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el) {
  for (var a = 1; a < arguments.length; a++) {
    var c = arguments[a];
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) add(el, c[i]); continue }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el }
function mount(el) { clear(el); for (var i = 1; i < arguments.length; i++) add(el, arguments[i]); return el }

/* Icons: trusted static markup from the server-side icon map. */
function ic(name, size, cls) {
  var s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("class", "i" + (cls ? " " + cls : ""));
  s.setAttribute("width", size || 16); s.setAttribute("height", size || 16);
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || "";
  return s;
}

function btn(label, opts) {
  opts = opts || {};
  var b = h("button", {
    type: "button",
    class: "btn " + (opts.cls || ""),
    title: opts.title, disabled: opts.disabled, onclick: opts.onclick,
    "aria-label": !label && opts.title ? opts.title : null
  }, opts.icon ? ic(opts.icon) : null, label ? h("span", { text: label }) : null, opts.kbd ? h("span", { class: "kbd", text: opts.kbd }) : null);
  return b;
}
function iconBtn(icon, title, onclick, cls) {
  return h("button", { type: "button", class: "icon-btn " + (cls || ""), title: title, "aria-label": title, onclick: onclick }, ic(icon));
}
function badge(text, cls, icon) { return h("span", { class: "badge " + (cls || "") }, icon ? ic(icon) : null, text) }
function kbd(t) { return h("span", { class: "kbd", text: t }) }
function methodPill(m, sm) { return h("span", { class: "method " + mcls(m) + (sm ? " sm" : ""), text: m }) }
function mcls(m) { return METHODS.indexOf(m) >= 0 ? m : "OTHER" }

function pathNode(path, cls) {
  var el = h("span", { class: "path " + (cls || ""), title: path });
  String(path).split(/(\/)/).forEach(function (seg) {
    if (seg === "/") el.appendChild(h("span", { class: "s", text: "/" }));
    else if (seg.charAt(0) === ":" || seg === "*") el.appendChild(h("span", { class: "p", text: seg }));
    else if (seg) el.appendChild(document.createTextNode(seg));
  });
  return el;
}

function emptyState(o) {
  return h("div", { class: "empty " + (o.cls || "") },
    h("div", { class: "empty-ico" }, ic(o.icon || "info", 20)),
    o.title ? h("h3", { text: o.title }) : null,
    o.text ? h("p", null, o.text) : null,
    o.action || null);
}
/* Text with inline code: rich("Use ", ["code", "x()"], " to …") */
function rich() {
  var f = document.createDocumentFragment();
  for (var i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    if (Array.isArray(a)) f.appendChild(h(a[0], null, a[1]));
    else f.appendChild(document.createTextNode(a));
  }
  return f;
}
function skelLines(n, widths) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(h("div", { class: "skel skel-line", style: "width:" + (widths ? widths[i % widths.length] : 60 + ((i * 37) % 35)) + "%" }));
  return out;
}
function isTyping(e) {
  var t = e.target;
  if (!t || !t.tagName) return false;
  var tag = t.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable;
}
function debounce(fn, ms) {
  var t;
  return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a) }, ms) };
}

/* ── formatting ──────────────────────────────────────── */
function fmtNum(n) { return Number(n || 0).toLocaleString() }
function fmtBytes(b) {
  b = Number(b || 0);
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}
function fmtMs(ms) { ms = Number(ms || 0); return ms < 1000 ? Math.round(ms) + " ms" : (ms / 1000).toFixed(2) + " s" }
function pad2(n) { return n < 10 ? "0" + n : String(n) }
function clock(d) { d = d ? new Date(d) : new Date(); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) }
function ago(t) {
  var s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function plural(n, w, p) { return fmtNum(n) + " " + (n === 1 ? w : (p || w + "s")) }

/* ── API ─────────────────────────────────────────────── */
function apiErr(r) {
  return r.text().then(function (t) {
    var msg = "HTTP " + r.status;
    try { var j = JSON.parse(t); if (j && j.error) msg = String(j.error) } catch (e) { if (t && t.length < 300) msg = t }
    var err = new Error(msg); err.status = r.status; throw err;
  });
}
function getJSON(url) {
  return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : apiErr(r) });
}
function postJSON(url, body) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) })
    .then(function (r) { return r.ok ? r.json() : apiErr(r) });
}

/* ── clipboard / download ────────────────────────────── */
function copyText(text, label) {
  text = String(text == null ? "" : text);
  var done = function () { toast((label || "Copied") + " to clipboard", "success") };
  var fallback = function () {
    var ta = h("textarea", { style: "position:fixed;left:-9999px;top:0", readonly: true });
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done() } catch (e) { toast("Copy failed", "error") }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}
function download(name, text, mime) {
  var a = h("a", { download: name });
  a.href = URL.createObjectURL(new Blob([text], { type: mime || "application/octet-stream" }));
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href) }, 2000);
}
function toCSV(rows, cols) {
  cols = cols || colsOf(rows);
  var q = function (v) {
    if (v == null) return "";
    if (typeof v === "object") v = JSON.stringify(v);
    v = String(v);
    return /[",\r\n]/.test(v) || /^[=+\-@]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return [cols.map(q).join(",")].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]) }).join(",") })).join("\r\n");
}
function colsOf(rows) {
  var seen = {}, out = [];
  (rows || []).slice(0, 100).forEach(function (r) { Object.keys(r || {}).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k) } }) });
  return out;
}

/* ── toasts ──────────────────────────────────────────── */
function toast(msg, type) {
  type = type || "info";
  var box = $("#toasts"); if (!box) return;
  var icn = { success: "success", error: "error", warn: "alert", info: "info" }[type] || "info";
  var el = h("div", { class: "toast " + type, role: type === "error" ? "alert" : "status" }, ic(icn), h("span", { text: msg }));
  box.appendChild(el);
  requestAnimationFrame(function () { el.classList.add("show") });
  setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove() }, 220) }, type === "error" ? 5200 : 3200);
  while (box.children.length > 4) box.removeChild(box.firstChild);
}

/* ── overlays (drawer / modal / menu) with an Esc stack ─ */
var OVERLAYS = [];
function pushOverlay(nodes, onClose) {
  var entry = { nodes: nodes, onClose: onClose, prevFocus: document.activeElement };
  nodes.forEach(function (n) { document.body.appendChild(n) });
  OVERLAYS.push(entry);
  return function () { closeOverlay(entry) };
}
function closeOverlay(entry) {
  var i = OVERLAYS.indexOf(entry); if (i < 0) return;
  OVERLAYS.splice(i, 1);
  entry.nodes.forEach(function (n) { n.remove() });
  if (entry.onClose) entry.onClose();
  if (entry.prevFocus && entry.prevFocus.focus && document.contains(entry.prevFocus)) { try { entry.prevFocus.focus({ preventScroll: true }) } catch (e) { /* ignore */ } }
}
function closeTopOverlay() { if (!OVERLAYS.length) return false; closeOverlay(OVERLAYS[OVERLAYS.length - 1]); return true }
function closeAllOverlays() { while (OVERLAYS.length) closeTopOverlay() }

function openModal(title, body, footer, opts) {
  opts = opts || {};
  var close;
  var ov = h("div", { class: "overlay", onclick: function () { close() } });
  var m = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title, style: opts.width ? "width:min(" + opts.width + "px,calc(100vw - 32px))" : null },
    title ? h("div", { class: "modal-h" }, h("h3", { text: title }), iconBtn("x", "Close", function () { close() }, "sm")) : null,
    body, footer ? h("div", { class: "modal-f" }, footer) : null);
  close = pushOverlay([ov, m]);
  return { el: m, close: close };
}

function openDrawer(title, body, footer, sub) {
  var close;
  var ov = h("div", { class: "overlay", onclick: function () { close() } });
  var d = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "drawer-h" }, h("h3", { class: "ellipsis", text: title }), sub || null, iconBtn("x", "Close (Esc)", function () { close() }, "sm")),
    h("div", { class: "drawer-b" }, body), footer ? h("div", { class: "drawer-f" }, footer) : null);
  close = pushOverlay([ov, d]);
  var x = $(".drawer-h .icon-btn", d); if (x) x.focus();
  return close;
}

/* Popover menu anchored under an element. build(close) returns its content. */
function openMenu(anchor, build, opts) {
  opts = opts || {};
  var close;
  var catcher = h("div", { style: "position:fixed;inset:0;z-index:89", onclick: function () { close() } });
  var m = h("div", { class: "menu", role: "menu", style: opts.width ? "width:" + opts.width + "px" : null });
  close = pushOverlay([catcher, m]);
  add(m, build(close));
  var r = anchor.getBoundingClientRect();
  var w = m.offsetWidth, hh = m.offsetHeight;
  var left = opts.alignRight ? r.right - w : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  var top = r.bottom + 6;
  if (top + hh > window.innerHeight - 8) top = Math.max(8, r.top - hh - 6);
  m.style.left = left + "px"; m.style.top = top + "px";
  var f = m.querySelector("input,select,button"); if (f) f.focus();
  return close;
}
function menuItem(label, icon, onclick, hint) {
  return h("button", { type: "button", class: "menu-it", role: "menuitem", onclick: onclick }, icon ? ic(icon) : null, h("span", { class: "ellipsis", text: label }), hint ? h("small", { text: hint }) : null);
}

/* ── JSON + SQL highlighting (DOM nodes, never HTML strings) ── */
function tryJSON(v) {
  if (typeof v !== "string") return undefined;
  var s = v.trim();
  if (!s || (s.charAt(0) !== "{" && s.charAt(0) !== "[")) return undefined;
  try { return JSON.parse(s) } catch (e) { return undefined }
}
function jsonNode(text) {
  var f = document.createDocumentFragment();
  var re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)|([{}\[\],:])/g;
  var last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) f.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) {
      f.appendChild(h("span", { class: m[2] ? "j-key" : "j-str", text: m[1] }));
      if (m[2]) f.appendChild(h("span", { class: "j-punc", text: m[2] }));
    } else if (m[3]) f.appendChild(h("span", { class: "j-bool", text: m[3] }));
    else if (m[4]) f.appendChild(h("span", { class: "j-null", text: m[4] }));
    else if (m[5]) f.appendChild(h("span", { class: "j-num", text: m[5] }));
    else f.appendChild(h("span", { class: "j-punc", text: m[6] }));
    last = re.lastIndex;
  }
  if (last < text.length) f.appendChild(document.createTextNode(text.slice(last)));
  return f;
}
function codeBlock(value, cls) {
  var text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  var pre = h("pre", { class: "code " + (cls || "") });
  if (typeof value !== "string" || tryJSON(value) !== undefined) pre.appendChild(jsonNode(text)); else pre.textContent = text;
  return pre;
}
function prettyMaybe(text) {
  var j = tryJSON(text);
  return j === undefined ? null : JSON.stringify(j, null, 2);
}

var SQL_KW = {};
("select from where and or not in is null like ilike between join left right inner outer full cross on as group by order having limit offset union all distinct case when then else end exists asc desc with recursive insert into values update set delete create table index view drop alter add column primary key foreign references unique default check pragma explain analyze describe show query plan cast true false collate natural using over partition window returning if replace temp temporary").split(" ").forEach(function (k) { SQL_KW[k] = 1 });
function sqlNode(text) {
  var f = document.createDocumentFragment();
  var re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:''|[^'])*'?)|("(?:""|[^"])*"?|[\x60][^\x60]*[\x60]?|\[[^\]\n]*\]?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)(?=(\s*\()?)|([(),;*=<>!+\-\/%|.]+)/g;
  var last = 0, m;
  while ((m = re.exec(text))) {
    if (m[0] === "") { re.lastIndex++; continue }
    if (m.index > last) f.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) f.appendChild(h("span", { class: "s-com", text: m[1] }));
    else if (m[2]) f.appendChild(h("span", { class: "s-str", text: m[2] }));
    else if (m[3]) f.appendChild(document.createTextNode(m[3]));
    else if (m[4]) f.appendChild(h("span", { class: "s-num", text: m[4] }));
    else if (m[5]) {
      if (SQL_KW[m[5].toLowerCase()]) f.appendChild(h("span", { class: "s-kw", text: m[5] }));
      else if (m[6]) f.appendChild(h("span", { class: "s-fn", text: m[5] }));
      else f.appendChild(document.createTextNode(m[5]));
    } else f.appendChild(h("span", { class: "s-op", text: m[7] }));
    last = re.lastIndex;
  }
  if (last < text.length) f.appendChild(document.createTextNode(text.slice(last)));
  return f;
}

/* ── data cell rendering (shared by table browser + SQL results) ── */
var DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+\-]\d{2}:?\d{2})?)?$/;
function isBoolCol(col) { return col && /^bool/i.test(col.type || "") }
function cellNode(v, col, fk) {
  if (v === null || v === undefined) return { node: h("span", { class: "nullp", text: "NULL" }) };
  if (typeof v === "boolean" || (isBoolCol(col) && (v === 0 || v === 1))) {
    var t = v === true || v === 1;
    return { node: h("span", { class: "boolp " + (t ? "t" : "f") }, ic(t ? "check" : "x"), t ? "true" : "false") };
  }
  if (fk && (typeof v === "number" || typeof v === "string")) {
    return {
      node: h("a", {
        class: "fklink", href: dbHash(fk.refTable, [{ column: fk.refColumn, op: "eq", value: v }]),
        title: "Open " + fk.refTable + " where " + fk.refColumn + " = " + v,
        onclick: function (e) { e.stopPropagation() }
      }, String(v), ic("arrowRight")), cls: typeof v === "number" ? "n" : ""
    };
  }
  if (typeof v === "number" || typeof v === "bigint") return { node: document.createTextNode(String(v)), cls: "n" };
  if (typeof v === "object") {
    if (v && v.type === "Buffer" && Array.isArray(v.data)) return { node: h("span", { class: "muted", text: "<binary " + fmtBytes(v.data.length) + ">" }) };
    var js = JSON.stringify(v);
    return { node: h("span", { class: "jsonp" }, h("b", { text: "JSON" }), js.length > 90 ? js.slice(0, 90) + "…" : js) };
  }
  var s = String(v);
  if (tryJSON(s) !== undefined) {
    var compact = JSON.stringify(JSON.parse(s));
    return { node: h("span", { class: "jsonp" }, h("b", { text: "JSON" }), compact.length > 90 ? compact.slice(0, 90) + "…" : compact) };
  }
  var dm = DATE_RE.exec(s);
  if (dm) return { node: h("span", { class: "datep", title: s }, dm[1], dm[2] ? h("span", { text: " " + dm[2] + (dm[3] === "Z" ? " UTC" : "") }) : null) };
  return { node: document.createTextNode(s.length > 160 ? s.slice(0, 160) + "…" : s) };
}
function valueToText(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  var p = typeof v === "string" ? prettyMaybe(v) : null;
  return p || String(v);
}

/*
 * Generic data grid.
 * opts: { columns:[{name,type,primary,fk}], rows, offset, sort, dir, onSort(name), onRow(row, idx), hidden:{} }
 */
function dataGrid(opts) {
  var cols = opts.columns.filter(function (c) { return !(opts.hidden && opts.hidden[c.name]) });
  var thead = h("tr", null, h("th", { class: "rn", text: "#" }));
  cols.forEach(function (c) {
    var sorted = opts.sort === c.name;
    var th = h("th", {
      class: opts.onSort ? "sortable" : "", title: c.type ? c.name + " · " + c.type : c.name,
      "aria-sort": sorted ? (opts.dir === "desc" ? "descending" : "ascending") : null,
      tabindex: opts.onSort ? "0" : null,
      onclick: opts.onSort ? function () { opts.onSort(c.name) } : null,
      onkeydown: opts.onSort ? function (e) { if (e.key === "Enter") opts.onSort(c.name) } : null
    }, h("span", { class: "th" },
      c.primary ? h("span", { class: "key", title: "Primary key" }, ic("key")) : c.fk ? h("span", { class: "fkey", title: "Foreign key → " + c.fk.refTable + "." + c.fk.refColumn }, ic("link")) : null,
      h("span", { text: c.name }),
      c.type ? h("span", { class: "ty", text: c.type }) : null,
      sorted ? h("span", { class: "sort-ind" }, ic(opts.dir === "desc" ? "arrowDown" : "arrowUp")) : null));
    thead.appendChild(th);
  });
  thead.appendChild(h("th", { class: "fill", "aria-hidden": "true" }));
  var tbody = h("tbody");
  var clickTimer = null;
  opts.rows.forEach(function (row, i) {
    var tr = h("tr", { tabindex: "-1" }, h("td", { class: "rn", text: String((opts.offset || 0) + i + 1) }));
    cols.forEach(function (c) {
      var r = cellNode(row[c.name], c, c.fk);
      var td = h("td", { class: r.cls || "" }, r.node);
      td.addEventListener("dblclick", function (e) {
        e.stopPropagation(); clearTimeout(clickTimer);
        var v = row[c.name];
        copyText(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v), "Cell value copied");
        td.classList.add("copied"); setTimeout(function () { td.classList.remove("copied") }, 700);
      });
      tr.appendChild(td);
    });
    tr.appendChild(h("td", { class: "fill" }));
    if (opts.onRow) {
      tr.addEventListener("click", function () {
        clearTimeout(clickTimer);
        clickTimer = setTimeout(function () {
          $$("tr.sel", tbody).forEach(function (x) { x.classList.remove("sel") });
          tr.classList.add("sel");
          opts.onRow(row, i);
        }, 210);
      });
    }
    tbody.appendChild(tr);
  });
  return h("table", { class: "grid" }, h("thead", null, thead), tbody);
}

function rowDrawer(title, row, columns, extraSub) {
  var names = columns && columns.length ? columns.map(function (c) { return c.name }) : Object.keys(row);
  var byName = {}; (columns || []).forEach(function (c) { byName[c.name] = c });
  Object.keys(row).forEach(function (k) { if (names.indexOf(k) < 0) names.push(k) });
  var body = h("div");
  names.forEach(function (n) {
    var c = byName[n] || {};
    var v = row[n];
    var isJ = (typeof v === "object" && v !== null) || tryJSON(v) !== undefined;
    var valEl;
    if (v === null || v === undefined) valEl = h("div", { class: "field-v" }, h("span", { class: "nullp", text: "NULL" }));
    else if (isJ) valEl = codeBlock(typeof v === "object" ? v : JSON.parse(v), "field-v");
    else valEl = h("div", { class: "field-v", text: String(v) });
    body.appendChild(h("div", { class: "field" },
      h("div", { class: "field-h" },
        h("span", { class: "nm", text: n }),
        c.type ? h("span", { class: "ty", text: c.type }) : null,
        c.primary ? badge("PK", "pk") : null,
        c.fk ? h("a", { class: "badge fk", href: dbHash(c.fk.refTable, v == null ? [] : [{ column: c.fk.refColumn, op: "eq", value: v }]), title: "Open referenced row" }, ic("link"), c.fk.refTable + "." + c.fk.refColumn) : null,
        isJ ? badge("JSON", "uq") : null,
        h("span", { class: "sp" }),
        iconBtn("copy", "Copy value", function () { copyText(v == null ? "" : valueToText(v), n + " copied") }, "sm")),
      valEl));
  });
  var close = openDrawer(title, body, [
    btn("Copy row as JSON", { icon: "braces", cls: "btn-sm", onclick: function () { copyText(JSON.stringify(row, null, 2), "Row JSON copied") } }),
    btn("Close", { cls: "btn-sm btn-ghost", onclick: function () { close() } })
  ], extraSub);
  return close;
}

function dbHash(table, filters, tab) {
  var s = "#/database/" + encodeURIComponent(table) + (tab ? "/" + tab : "");
  if (filters && filters.length) s += "?f=" + encodeURIComponent(JSON.stringify(filters));
  return s;
}

/* Key/value rows editor (query params, headers). rows: [{k,v,on}] mutated in place. */
function kvEditor(rows, onChange, placeholders) {
  placeholders = placeholders || ["key", "value"];
  var wrap = h("div", { class: "kv" });
  function ensureBlank() {
    var last = rows[rows.length - 1];
    if (!last || last.k || last.v) rows.push({ k: "", v: "", on: true });
  }
  function draw() {
    ensureBlank();
    mount(wrap, h("div", { class: "kv-head" }, h("span"), h("span", { text: placeholders[0] }), h("span", { text: placeholders[1] }), h("span")),
      rows.map(function (r, i) {
        var isBlank = i === rows.length - 1 && !r.k && !r.v;
        var row = h("div", { class: "kv-row" + (r.on ? "" : " off") });
        var cb = h("input", { type: "checkbox", class: "check", checked: r.on, disabled: isBlank, title: "Enable", "aria-label": "Enable row", onchange: function () { r.on = cb.checked; row.classList.toggle("off", !r.on); onChange() } });
        var k = h("input", { class: "input sm", value: r.k, placeholder: placeholders[0], spellcheck: "false", "aria-label": placeholders[0] });
        var v = h("input", { class: "input sm", value: r.v, placeholder: placeholders[1], spellcheck: "false", "aria-label": placeholders[1] });
        var onInput = function () {
          r.k = k.value; r.v = v.value;
          var wasBlank = isBlank; onChange();
          if (wasBlank && (r.k || r.v)) { isBlank = false; cb.disabled = false; rows.push({ k: "", v: "", on: true }); var focusEl = document.activeElement; draw(); restoreFocus(focusEl === k ? i * 2 : i * 2 + 1) }
        };
        k.addEventListener("input", onInput); v.addEventListener("input", onInput);
        add(row, h("span", { style: "display:grid;place-items:center" }, cb), k, v,
          isBlank ? h("span") : iconBtn("x", "Remove", function () { rows.splice(i, 1); onChange(); draw() }, "sm"));
        return row;
      }));
  }
  function restoreFocus(idx) {
    var inputs = $$(".input", wrap); var el = inputs[idx];
    if (el) { el.focus(); var n = el.value.length; try { el.setSelectionRange(n, n) } catch (e) { /* ignore */ } }
  }
  draw();
  return wrap;
}
`
