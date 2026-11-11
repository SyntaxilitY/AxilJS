/**
 * Client runtime — Endpoints explorer + request builder (via /api/studio/proxy).
 */
export const ENDPOINTS = String.raw`
function epHash(r) { return "#/endpoints/" + encodeURIComponent(r.method) + "/" + encodeURIComponent(r.path) }
function epKey(r) { return r.method + " " + r.path }
function pathParams(path) { return (String(path).match(/:([A-Za-z_][A-Za-z0-9_]*)/g) || []).map(function (p) { return p.slice(1) }) }
function hasBody(m) { return BODY_METHODS.indexOf(m) >= 0 }

function sampleBody(r) {
  var p = r.path.toLowerCase();
  if (/login|signin|session/.test(p)) return { email: "user@example.com", password: "password123" };
  if (/register|signup/.test(p)) return { name: "Ada Lovelace", email: "ada@example.com", password: "password123" };
  if (/user/.test(p)) return { name: "Ada Lovelace", email: "ada@example.com" };
  if (/product/.test(p)) return { sku: "SKU-1001", title: "New product", price: 19.99, stock: 10 };
  if (/order/.test(p)) return { userId: 1, items: [{ productId: 1, qty: 2 }] };
  if (/post|article/.test(p)) return { title: "Hello", content: "Content here" };
  return { key: "value" };
}
function draftFor(r) {
  var k = epKey(r);
  if (!S.ep.drafts[k]) {
    var params = {}; pathParams(r.path).forEach(function (p) { params[p] = /id$/i.test(p) ? "1" : "" });
    S.ep.drafts[k] = {
      params: params, query: [], headers: [],
      body: hasBody(r.method) && r.method !== "DELETE" ? JSON.stringify(sampleBody(r), null, 2) : ""
    };
  }
  return S.ep.drafts[k];
}
function resolvePath(r, d) {
  return r.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, function (m, p) { var v = d.params[p]; return v ? encodeURIComponent(v) : m });
}
function queryObj(d) { var o = {}; d.query.forEach(function (q) { if (q.on && q.k) o[q.k] = q.v }); return o }
function headerObj(d) {
  var o = {};
  d.headers.forEach(function (x) { if (x.on && x.k) o[x.k] = x.v });
  var tok = store.get("bearer", "");
  var hasAuth = Object.keys(o).some(function (k) { return k.toLowerCase() === "authorization" });
  if (tok && !hasAuth) o.Authorization = "Bearer " + tok;
  return o;
}
function sendBody(r, d) { return hasBody(r.method) && d.body.trim() ? d.body : undefined }
function qs(o) { var k = Object.keys(o); return k.length ? "?" + k.map(function (x) { return encodeURIComponent(x) + "=" + encodeURIComponent(o[x]) }).join("&") : "" }
function fullUrl(r, d) { return S.data.appUrl.replace(/\/$/, "") + resolvePath(r, d) + qs(queryObj(d)) }
function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }
function curlFor(r, d) {
  var hdr = headerObj(d), body = sendBody(r, d);
  if (body !== undefined && !Object.keys(hdr).some(function (k) { return k.toLowerCase() === "content-type" })) hdr["Content-Type"] = "application/json";
  var parts = ["curl" + (r.method === "GET" ? "" : " -X " + r.method) + " " + shq(fullUrl(r, d))];
  Object.keys(hdr).forEach(function (k) { parts.push("-H " + shq(k + ": " + hdr[k])) });
  if (body !== undefined) parts.push("--data-raw " + shq(body));
  return parts.join(" \\\n  ");
}

function epHistory(r) { var all = store.get("ep-history", {}); return all[epKey(r)] || [] }
function pushEpHistory(r, entry) {
  var all = store.get("ep-history", {}); var k = epKey(r);
  all[k] = [entry].concat(all[k] || []).slice(0, 10);
  store.set("ep-history", all);
}

function sendRequest(r, ui) {
  var d = draftFor(r), k = epKey(r);
  var missing = pathParams(r.path).filter(function (p) { return !d.params[p] });
  if (missing.length) { toast("Fill in path parameter :" + missing[0], "warn"); S.ep.tab[k] = "params"; ui.drawTabs(); var inp = $("[data-param='" + missing[0] + "']", ui.root); if (inp) inp.focus(); return }
  var body = sendBody(r, d);
  var headers = headerObj(d);
  if (body !== undefined && !Object.keys(headers).some(function (x) { return x.toLowerCase() === "content-type" })) headers["Content-Type"] = "application/json";
  var payload = { method: r.method, path: resolvePath(r, d), query: queryObj(d), headers: headers };
  if (body !== undefined) payload.body = body;
  S.ep.busy[k] = true; ui.drawResp();
  var started = Date.now();
  fetch("/api/studio/proxy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(function (res) { return res.text().then(function (t) { var j = null; try { j = JSON.parse(t) } catch (e) { /* not json */ } return { http: res.status, j: j, t: t } }) })
    .then(function (x) {
      var out;
      if (x.http === 200 && x.j && typeof x.j.status === "number") { out = x.j; noteAppStatus(true) }
      else if (x.http === 404 && !(x.j && x.j.error)) out = { error: "The Studio proxy endpoint is not available on this server.", kind: "proxy", timeMs: Date.now() - started };
      else { out = { error: (x.j && x.j.error) || ("Proxy returned HTTP " + x.http), kind: x.http === 502 ? "down" : "proxy", timeMs: (x.j && x.j.timeMs) || Date.now() - started }; if (x.http === 502) noteAppStatus(false) }
      out.at = Date.now();
      S.ep.resp[k] = out;
      pushEpHistory(r, { t: out.at, status: out.status || 0, statusText: out.statusText || "", timeMs: out.timeMs || 0, size: out.size || 0, error: out.error || null, draft: JSON.parse(JSON.stringify(d)) });
    })
    .catch(function (e) { S.ep.resp[k] = { error: e.message, kind: "proxy", at: Date.now() } })
    .finally(function () { S.ep.busy[k] = false; if (document.contains(ui.root)) { ui.drawResp(); ui.drawTabs() } });
}

defineView("endpoints", {
  title: "Endpoints", icon: "endpoints", key: "e", full: true,
  render: function (el, route) {
    if (!S.data) { mount(el, h("div", { class: "pane pane-l" }, h("div", { class: "pane-h" }, h("div", { class: "skel", style: "height:30px" })), h("div", { style: "padding:12px" }, skelLines(10))), h("div", { class: "workspace" }, h("div", { class: "rb" }, skelLines(8)))); return }
    var routes = S.data.routes;
    var selected = null;
    if (route.parts.length >= 2) {
      var m = route.parts[0].toUpperCase(), p = route.parts.slice(1).join("/");
      selected = routes.filter(function (r) { return r.method === m && r.path === p })[0] || null;
    }
    if (selected) el.classList.add("has-sel");
    setCrumbs(selected ? [{ label: "Endpoints", href: "#/endpoints" }, { label: selected.method + " " + selected.path, mono: true }] : [{ label: "Endpoints" }]);

    if (!routes.length) {
      mount(el, h("div", { class: "workspace" }, emptyState({
        cls: "fill", icon: "endpoints", title: "No routes discovered",
        text: rich("Studio scans ", ["code", "src/"], " for calls like ", ["code", "router.get('/users', handler)"], " or ", ["code", "app.post(…)"], ". Add a route and refresh."),
        action: btn("Refresh", { icon: "refresh", cls: "btn-sm", onclick: function () { refresh(true) } })
      })));
      return;
    }

    /* list pane */
    var listBody = h("div", { class: "pane-b", role: "navigation", "aria-label": "Endpoints" });
    var search = h("input", { class: "input sm", type: "search", placeholder: "Filter endpoints…", value: S.ep.q, "aria-label": "Filter endpoints", spellcheck: "false" });
    var chips = h("div", { class: "chips" });
    var countEl = h("span", { class: "muted", style: "font-weight:500;text-transform:none;letter-spacing:0" });
    function drawChips() {
      var counts = { ALL: routes.length };
      routes.forEach(function (r) { counts[r.method] = (counts[r.method] || 0) + 1 });
      mount(chips, ["ALL"].concat(METHODS.filter(function (m) { return counts[m] })).map(function (m) {
        return h("button", { type: "button", class: "chip mchip " + m + (S.ep.method === m ? " on" : ""), "aria-pressed": S.ep.method === m ? "true" : "false", onclick: function () { S.ep.method = m; drawChips(); drawList() } }, m, h("small", { text: counts[m] }));
      }));
    }
    function drawList() {
      var q = S.ep.q.toLowerCase();
      var list = routes.filter(function (r) {
        return (S.ep.method === "ALL" || r.method === S.ep.method) &&
          (!q || (r.method + " " + r.path + " " + (r.handler || "") + " " + (r.middleware || []).join(" ")).toLowerCase().indexOf(q) >= 0);
      });
      countEl.textContent = list.length === routes.length ? String(routes.length) : list.length + " / " + routes.length;
      var groups = {}, order = [];
      list.forEach(function (r) { var g = routeGroup(r.path); if (!groups[g]) { groups[g] = []; order.push(g) } groups[g].push(r) });
      if (!list.length) { mount(listBody, emptyState({ cls: "sm", icon: "search", title: "No matches", text: "Try another search or method." })); return }
      mount(listBody, order.map(function (g) {
        var closed = !!S.ep.closed[g] && !q;
        return h("div", null,
          h("button", { type: "button", class: "group-h" + (closed ? " closed" : ""), "aria-expanded": closed ? "false" : "true", onclick: function () { S.ep.closed[g] = !S.ep.closed[g]; drawList() } },
            ic("chevronDown"), h("span", { text: g }), h("span", { class: "cnt", text: groups[g].length })),
          closed ? null : groups[g].map(function (r) {
            var auth = (r.middleware || []).some(function (x) { return /auth/i.test(x) });
            return h("a", { class: "ep" + (selected === r ? " active" : ""), href: epHash(r), title: r.method + " " + r.path },
              methodPill(r.method, true), pathNode(r.path), auth ? h("span", { class: "lock", title: "Requires auth middleware" }, ic("lock")) : null);
          }));
      }));
      var act = $(".ep.active", listBody); if (act) act.scrollIntoView({ block: "nearest" });
    }
    search.addEventListener("input", debounce(function () { S.ep.q = search.value; drawList() }, 80));
    var pane = h("div", { class: "pane pane-l collapsible-sel" },
      h("div", { class: "pane-h" }, h("div", { class: "pane-title" }, "Endpoints", h("span", { class: "sp" }), countEl), h("div", { class: "search" }, ic("search"), search), chips),
      listBody);
    drawChips(); drawList();

    var ws = h("div", { class: "workspace collapsible-ws" });
    mount(el, pane, ws);
    if (!selected) {
      mount(ws, emptyState({ cls: "fill", icon: "send", title: "Pick an endpoint", text: rich("Choose a route on the left to build a request. Requests go through the Studio proxy to ", ["code", S.data.appUrl], ".") }));
      return;
    }
    renderBuilder(ws, selected);
  }
});

function renderBuilder(ws, r) {
  var k = epKey(r), d = draftFor(r);
  var params = pathParams(r.path);
  var mw = r.middleware || [];
  var ui = { root: ws };
  if (!S.ep.tab[k]) S.ep.tab[k] = params.length ? "params" : hasBody(r.method) && r.method !== "DELETE" ? "body" : "params";

  var urlEl = h("div", { class: "urlbar-url", title: "Resolved URL" });
  function drawUrl() {
    var base = S.data.appUrl.replace(/\/$/, "");
    var q = qs(queryObj(d));
    var parts = [h("span", { class: "base", text: base })];
    r.path.split(/(:[A-Za-z_][A-Za-z0-9_]*)/).forEach(function (seg) {
      if (seg.charAt(0) === ":") { var v = d.params[seg.slice(1)]; parts.push(h("span", { class: "p", text: v ? v : seg })) }
      else if (seg) parts.push(document.createTextNode(seg));
    });
    if (q) parts.push(h("span", { class: "q", text: q }));
    mount(urlEl, parts);
  }
  var sendBtn = btn("Send", { icon: "send", cls: "btn-primary", title: "Send (Ctrl+Enter)", onclick: function () { sendRequest(r, ui) } });
  var changed = function () { drawUrl(); drawCounts() };

  /* tabs */
  var tabsEl = h("div", { class: "tabs sm", role: "tablist" });
  var panel = h("div", { class: "card-b" });
  var TABS = [["params", "Params"], ["headers", "Headers"], ["auth", "Auth"], ["body", "Body"], ["history", "History"]];
  function counts() {
    return {
      params: params.length + d.query.filter(function (q) { return q.on && q.k }).length,
      headers: d.headers.filter(function (x) { return x.on && x.k }).length,
      auth: store.get("bearer", "") ? "•" : "",
      body: hasBody(r.method) && d.body.trim() ? "•" : "",
      history: epHistory(r).length
    };
  }
  function drawCounts() {
    var c = counts();
    $$(".tab", tabsEl).forEach(function (t) { var cn = $(".cnt", t); var v = c[t.getAttribute("data-k")]; if (cn) { cn.textContent = v; cn.style.display = v ? "" : "none" } });
  }
  function drawTabs() {
    var cur = S.ep.tab[k];
    mount(tabsEl, TABS.map(function (t) {
      return h("button", { type: "button", role: "tab", class: "tab" + (cur === t[0] ? " active" : ""), "aria-selected": cur === t[0] ? "true" : "false", "data-k": t[0], onclick: function () { S.ep.tab[k] = t[0]; drawTabs() } }, t[1], h("span", { class: "cnt" }));
    }));
    drawCounts();
    drawPanel();
  }
  ui.drawTabs = drawTabs;

  function drawPanel() {
    var cur = S.ep.tab[k];
    if (cur === "params") {
      mount(panel,
        params.length ? h("div", { class: "sect" }, h("div", { class: "sect-h", text: "Path parameters" }),
          params.map(function (p) {
            var inp = h("input", { class: "input sm mono", value: d.params[p] || "", placeholder: p, "data-param": p, spellcheck: "false", id: "pp-" + p });
            inp.addEventListener("input", function () { d.params[p] = inp.value; changed() });
            return h("div", { class: "param-row" }, h("label", { for: "pp-" + p }, ":" + p, h("small", { text: "required · string" })), inp);
          })) : null,
        h("div", { class: "sect" }, h("div", { class: "sect-h", text: "Query parameters" }), kvEditor(d.query, changed, ["name", "value"])));
    } else if (cur === "headers") {
      mount(panel, kvEditor(d.headers, changed, ["header", "value"]),
        h("div", { class: "hint", style: "margin-top:10px" }, ic("info"), "Content-Type: application/json is added automatically when a body is sent; the Auth tab adds Authorization."));
    } else if (cur === "auth") {
      var tok = h("input", { class: "input mono", type: "password", value: store.get("bearer", ""), placeholder: "eyJhbGciOi…", spellcheck: "false", autocomplete: "off", "aria-label": "Bearer token", style: "flex:1" });
      var show = iconBtn("eye", "Show / hide token", function () { tok.type = tok.type === "password" ? "text" : "password" });
      tok.addEventListener("input", function () { store.set("bearer", tok.value.trim()); changed() });
      var needs = mw.some(function (x) { return /auth/i.test(x) });
      mount(panel,
        h("div", { class: "sect" }, h("div", { class: "sect-h" }, "Bearer token", h("span", { class: "sp" }), needs ? badge("route uses " + mw.filter(function (x) { return /auth/i.test(x) })[0], "warn", "lock") : null),
          h("div", { class: "row" }, tok, show, btn("Clear", { cls: "btn-sm", onclick: function () { tok.value = ""; store.del("bearer"); changed() } })),
          h("div", { class: "hint", style: "margin-top:8px" }, ic("info"), "Sent as Authorization: Bearer … on every request. Remembered in this browser's localStorage.")));
    } else if (cur === "body") {
      if (!hasBody(r.method)) { mount(panel, emptyState({ cls: "sm", icon: "braces", title: r.method + " requests have no body", text: "Use query parameters to send data with this request." })); return }
      var ta = h("textarea", { spellcheck: "false", "aria-label": "Request body (JSON)", placeholder: "{ }" });
      ta.value = d.body;
      var status = h("span", { class: "notice" });
      var validate = function () {
        var t = ta.value.trim();
        if (!t) { mount(status, "Empty body"); return }
        try { JSON.parse(t); mount(status, h("span", { style: "color:var(--ok);display:inline-flex;align-items:center;gap:5px" }, ic("check"), "Valid JSON")) }
        catch (e) { mount(status, h("span", { style: "color:var(--err)", text: e.message.replace(/^JSON\.parse: /, "") })) }
      };
      ta.addEventListener("input", function () { d.body = ta.value; validate(); drawCounts() });
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); var s = ta.selectionStart; ta.setRangeText("  ", s, ta.selectionEnd, "end"); d.body = ta.value }
      });
      mount(panel, h("div", { class: "editor-box" },
        h("div", { class: "editor-bar" }, badge("JSON", "uq"), status, h("span", { class: "sp" }),
          btn("Format", { icon: "wand", cls: "btn-xs btn-ghost", onclick: function () { try { ta.value = JSON.stringify(JSON.parse(ta.value), null, 2); d.body = ta.value; validate() } catch (e) { toast("Body is not valid JSON", "warn") } } }),
          btn("Sample", { icon: "file", cls: "btn-xs btn-ghost", onclick: function () { ta.value = JSON.stringify(sampleBody(r), null, 2); d.body = ta.value; validate(); drawCounts() } }),
          btn("Clear", { icon: "eraser", cls: "btn-xs btn-ghost", onclick: function () { ta.value = ""; d.body = ""; validate(); drawCounts() } })),
        ta));
      validate();
    } else {
      var hist = epHistory(r);
      mount(panel, hist.length ? h("div", { class: "card", style: "box-shadow:none" }, hist.map(function (x) {
        return h("button", {
          type: "button", class: "hist-item", title: "Restore this request", onclick: function () {
            S.ep.drafts[k] = JSON.parse(JSON.stringify(x.draft)); d = S.ep.drafts[k];
            S.ep.tab[k] = "params"; drawUrl(); drawTabs(); toast("Request restored", "info");
          }
        }, x.error ? h("span", { class: "status serr", text: "ERR" }) : h("span", { class: "status s" + String(x.status).charAt(0), text: x.status }),
          h("span", { class: "path", text: resolvePath(r, x.draft) + qs(queryObj(x.draft)) }),
          h("span", { class: "muted num", style: "font-size:12px", text: fmtMs(x.timeMs) }),
          h("time", { text: ago(x.t) }));
      })) : emptyState({ cls: "sm", icon: "history", title: "No history yet", text: "The last 10 requests to this endpoint are kept here." }),
        hist.length ? h("div", { class: "row", style: "margin-top:10px;justify-content:flex-end" }, btn("Clear history", { icon: "trash", cls: "btn-xs btn-ghost", onclick: function () { var all = store.get("ep-history", {}); delete all[k]; store.set("ep-history", all); drawTabs() } })) : null);
    }
  }

  /* response */
  var respCard = h("div", { class: "card resp" });
  function drawResp() {
    var res = S.ep.resp[k];
    if (S.ep.busy[k]) {
      sendBtn.disabled = true;
      mount(respCard, h("div", { class: "resp-h" }, h("div", { class: "h2" }, "Response")), h("div", { class: "empty sm" }, h("div", { class: "empty-ico" }, ic("refresh", 20, "spin")), h("p", { text: "Sending " + r.method + " " + resolvePath(r, d) + "…" })));
      return;
    }
    sendBtn.disabled = false;
    if (!res) {
      mount(respCard, h("div", { class: "resp-h" }, h("div", { class: "h2" }, "Response")),
        emptyState({ cls: "sm", icon: "send", title: "No response yet", text: h("span", null, "Press ", kbd("Ctrl"), " ", kbd("Enter"), " or Send to call the endpoint.") }));
      return;
    }
    if (res.error) {
      var down = res.kind === "down";
      mount(respCard, h("div", { class: "resp-h" }, h("div", { class: "h2" }, "Response"), h("span", { class: "status serr" }, ic("error", 12), down ? "Connection failed" : "Proxy error"),
        h("span", { class: "resp-meta" }, res.timeMs ? h("span", null, h("b", { text: fmtMs(res.timeMs) })) : null)),
        emptyState({
          cls: "err", icon: "plug", title: down ? "Can't reach your app" : "Request could not be proxied",
          text: h("span", null, h("span", { style: "display:block;margin-bottom:6px;font-family:var(--mono);font-size:12px;color:var(--err)", text: res.error }),
            down ? rich("Start it with ", ["code", "axil run"], " (expected at ", ["code", S.data.appUrl], "), then retry.") : ""),
          action: btn("Retry", { icon: "refresh", cls: "btn-sm", onclick: function () { sendRequest(r, ui) } })
        }));
      return;
    }
    var view = S.ep.rtab;
    var hdrs = res.headers || {};
    var ctype = String(hdrs["content-type"] || hdrs["Content-Type"] || "");
    var pretty = prettyMaybe(res.body || "");
    var tabs = h("div", { class: "tabs sm", role: "tablist" }, [["body", "Body"], ["headers", "Headers"], ["raw", "Raw"]].map(function (t) {
      return h("button", { type: "button", role: "tab", class: "tab" + (view === t[0] ? " active" : ""), onclick: function () { S.ep.rtab = t[0]; drawResp() } }, t[1], t[0] === "headers" ? h("span", { class: "cnt", text: Object.keys(hdrs).length }) : null);
    }));
    var content;
    if (view === "headers") {
      content = Object.keys(hdrs).length ? h("table", { class: "hdr-tbl" }, h("tbody", null, Object.keys(hdrs).sort().map(function (n) { var v = hdrs[n]; return h("tr", null, h("td", { text: n }), h("td", { text: Array.isArray(v) ? v.join(", ") : String(v) })) }))) : emptyState({ cls: "sm", icon: "info", text: "No headers" });
    } else if (view === "raw") {
      content = h("pre", { class: "code", text: "HTTP/1.1 " + res.status + " " + (res.statusText || "") + "\n" + Object.keys(hdrs).map(function (n) { return n + ": " + hdrs[n] }).join("\n") + "\n\n" + (res.body || "") });
    } else {
      content = !res.body ? emptyState({ cls: "sm", icon: "file", text: "Empty response body" }) : pretty ? codeBlock(pretty) : h("pre", { class: "code", text: res.body });
    }
    mount(respCard,
      h("div", { class: "resp-h" }, h("div", { class: "h2", style: "flex:none" }, "Response"),
        h("span", { class: "status s" + String(res.status).charAt(0) }, h("span", { class: "dot" }), res.status + " " + (res.statusText || "")),
        h("span", { class: "resp-meta" }, h("span", null, h("b", { text: fmtMs(res.timeMs) })), h("span", null, h("b", { text: fmtBytes(res.size != null ? res.size : (res.body || "").length) })), ctype ? h("span", { class: "mono ellipsis", style: "max-width:220px", text: ctype.split(";")[0] }) : null),
        tabs),
      res.truncated ? h("div", { class: "hint", style: "padding:8px 16px;border-bottom:1px solid var(--border)" }, ic("alert"), "Body truncated by the proxy.") : null,
      content,
      h("div", { class: "card-f" }, h("span", { class: "muted", style: "font-size:12px", text: "Received " + clock(res.at) }), h("span", { class: "sp" }),
        btn("Copy body", { icon: "copy", cls: "btn-xs btn-ghost", onclick: function () { copyText(pretty || res.body || "", "Response body copied") } })));
  }
  ui.drawResp = drawResp;

  var root = h("div", { class: "rb" },
    h("a", { class: "btn btn-sm btn-ghost mobile-back", href: "#/endpoints", style: "margin-bottom:10px" }, ic("arrowLeft"), h("span", { text: "All endpoints" })),
    h("div", { class: "rb-head" },
      h("div", { class: "grow" }, h("h2", null, methodPill(r.method), h("span", { text: r.path })),
        h("div", { class: "rb-meta" },
          h("span", null, "handler ", h("code", { text: r.handler || "anonymous" })),
          mw.length ? h("span", { class: "faint", text: "·" }) : null,
          mw.map(function (m) { return h("span", { class: "tag" + (/auth/i.test(m) ? " auth" : ""), text: m }) }),
          r.description ? h("span", { text: "· " + r.description }) : null)),
      h("div", { class: "row" },
        btn("Copy as cURL", { icon: "code", cls: "btn-sm", onclick: function () { copyText(curlFor(r, draftFor(r)), "cURL command copied") } }),
        iconBtn("link", "Copy URL", function () { copyText(fullUrl(r, draftFor(r)), "URL copied") }))),
    h("div", { class: "urlbar" }, h("span", { class: "method " + mcls(r.method) }, r.method), urlEl, sendBtn),
    h("div", { class: "rb-grid" }, h("div", { class: "card" }, tabsEl, panel), respCard));
  ui.root = root;
  mount(ws, root);
  drawUrl(); drawTabs(); drawResp();
  var onKey = function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !OVERLAYS.length) { e.preventDefault(); sendRequest(r, ui) } };
  document.addEventListener("keydown", onKey);
  S.cleanup.push(function () { document.removeEventListener("keydown", onKey) });
}
`
