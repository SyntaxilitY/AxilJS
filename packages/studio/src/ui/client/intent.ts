/**
 * Client runtime — Intent: live view of the @axiljs/runtime report (intent
 * mode, contract violations, SLOs, circuit breakers, enforced decorators).
 * Polls GET /api/studio/intent every 2 s while the view is open and visible.
 */
export const INTENT = String.raw`
var INTENT_POLL_MS = 2000;
var INTENT_MAX_ROWS = 200;
var INTENT_SETUP = [
  "// src/main.ts (or wherever the app is created)",
  "import '@axiljs/runtime'",
  "import { wire } from '@axiljs/runtime'",
  "import { intentEndpoint } from '@axiljs/studio'",
  "",
  "wire(OrderService)          // executes the t* decorators on its methods",
  "app.use(intentEndpoint())   // development only: lets Studio read the report"
].join("\n");

function intentState() {
  if (!S.intent) S.intent = { data: null, error: null, at: 0, busy: false, sig: "" };
  return S.intent;
}
function intentSig(d) {
  if (!d) return "";
  var copy = {}; for (var k in d) { if (k !== "generatedAt") copy[k] = d[k] }
  return JSON.stringify(copy);
}
function pct(f, digits) {
  var n = Number(f || 0) * 100;
  return (n === 0 ? "0" : n < 0.1 ? n.toFixed(digits == null ? 2 : digits) : n < 10 ? n.toFixed(1) : Math.round(n)) + "%";
}
function intentModeBadge(mode) {
  if (mode === "enforce") return badge("enforce", "accent", "shield");
  if (mode === "warn") return badge("warn", "warn", "alert");
  return badge("off", "", "dot");
}
function circuitBadge(state) {
  if (state === "CLOSED") return badge("closed", "ok", "dot");
  if (state === "OPEN") return badge("open", "err", "dot");
  if (state === "HALF_OPEN") return badge("half-open", "warn", "dot");
  return badge(String(state).toLowerCase(), "", "dot");
}
function intentStat(icon, label, val, sub, cls) {
  return h("div", { class: "card stat" + (cls ? " " + cls : "") },
    h("div", { class: "stat-top" }, h("span", { text: label }), h("span", { class: "stat-ico" }, ic(icon))),
    h("div", { class: "stat-val", text: val }), h("div", { class: "stat-sub" }, sub));
}
function intentTime(ts) { var t = ts ? new Date(ts) : null; return t && !isNaN(t.getTime()) ? clock(t) : "—" }
function idCell(v) { return v ? h("span", { class: "mono", title: String(v), text: String(v).length > 14 ? String(v).slice(0, 12) + "…" : String(v) }) : h("span", { class: "faint", text: "—" }) }

function intentViolationsCard(list) {
  var rows = list.slice().reverse();
  var shown = rows.slice(0, INTENT_MAX_ROWS);
  var head = h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("alert"), "Violations", h("span", { class: "muted", style: "font-weight:500", text: "· " + fmtNum(list.length) })),
    rows.length > INTENT_MAX_ROWS ? h("span", { class: "muted", style: "font-size:12px", text: "newest " + INTENT_MAX_ROWS + " shown" }) : null);
  if (!rows.length) return h("div", { class: "card", id: "intent-violations" }, head,
    emptyState({ cls: "sm", icon: "success", title: "No violations recorded", text: "Every wired contract has held since the app started." }));
  return h("div", { class: "card", id: "intent-violations" }, head, h("div", { class: "tbl-scroll" }, h("table", { class: "tbl intent-tbl" },
    h("thead", null, h("tr", null, h("th", { text: "Time" }), h("th", { text: "Decorator" }), h("th", { text: "Target" }), h("th", { text: "Detail" }), h("th", { text: "Request" }), h("th", { text: "Tenant" }))),
    h("tbody", null, shown.map(function (v) {
      return h("tr", null,
        h("td", { class: "num muted", style: "white-space:nowrap", title: v.timestamp || "", text: intentTime(v.timestamp) }),
        h("td", null, h("span", { class: "tag", text: v.decorator || "?" })),
        h("td", { class: "mono", text: v.target || "" }),
        h("td", { class: "intent-detail", text: v.detail || "" }),
        h("td", null, idCell(v.requestId)),
        h("td", null, idCell(v.tenantId)));
    })))));
}

function intentSloCard(slo) {
  var head = h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("clock"), "Service level objectives", h("span", { class: "muted", style: "font-weight:500", text: "· " + fmtNum(slo.length) })));
  if (!slo.length) return h("div", { class: "card", id: "intent-slo" }, head,
    emptyState({ cls: "sm", icon: "clock", title: "No SLO data yet", text: rich("Methods decorated with ", ["code", "tSlo"], " appear here after their first call.") }));
  return h("div", { class: "card", id: "intent-slo" }, head, h("div", { class: "tbl-scroll" }, h("table", { class: "tbl intent-tbl" },
    h("thead", null, h("tr", null, h("th", { text: "Target" }), h("th", { text: "p" }), h("th", { text: "Latency (observed / target)" }), h("th", { text: "Errors (rate / budget)" }), h("th", { text: "Samples" }), h("th", { text: "Status" }))),
    h("tbody", null, slo.map(function (s) {
      var ok = s.meetsLatency !== false && s.meetsErrorBudget !== false;
      var why = [];
      if (s.meetsLatency === false) why.push("latency");
      if (s.meetsErrorBudget === false) why.push("errors");
      return h("tr", null,
        h("td", { class: "mono", text: s.target }),
        h("td", { class: "num muted", text: "p" + s.percentile }),
        h("td", { class: "num" }, h("span", { class: s.meetsLatency === false ? "intent-bad" : "", text: fmtMs(s.observedMs) }), h("span", { class: "muted", text: " / " + (s.targetMs == null ? "—" : fmtMs(s.targetMs)) })),
        h("td", { class: "num" }, h("span", { class: s.meetsErrorBudget === false ? "intent-bad" : "", text: pct(s.errorRate) }), h("span", { class: "muted", text: " / " + (s.errorBudget == null ? "—" : pct(s.errorBudget)) })),
        h("td", { class: "num muted", text: fmtNum(s.samples) }),
        h("td", null, ok ? badge("meeting", "ok", "check") : badge("breaching " + why.join(" + "), "err", "alert")));
    })))));
}

function intentCircuitsCard(circuits) {
  var names = Object.keys(circuits).sort();
  return h("div", { class: "card", id: "intent-circuits" },
    h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("plug"), "Circuit breakers", h("span", { class: "muted", style: "font-weight:500", text: "· " + names.length }))),
    names.length ? names.map(function (n) {
      return h("div", { class: "list-row" }, h("span", { class: "grow mono ellipsis", title: n, text: n }), circuitBadge(circuits[n]));
    }) : emptyState({ cls: "sm", icon: "plug", title: "No circuits yet", text: rich("Methods decorated with ", ["code", "tCircuitBreaker"], " appear here after their first call.") }));
}

function intentEnforcedCard(enforced) {
  var list = enforced.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0) });
  return h("div", { class: "card", id: "intent-enforced" },
    h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("layers"), "Enforced decorators", h("span", { class: "muted", style: "font-weight:500", text: "· " + list.length })),
      h("span", { class: "muted", style: "font-size:12px", text: "outermost first" })),
    list.length ? list.map(function (d) {
      return h("div", { class: "list-row" }, h("span", { class: "grow mono ellipsis", text: d.decorator }), h("span", { class: "tag", title: "Interceptor order (lower runs outside)", text: String(d.order) }));
    }) : emptyState({ cls: "sm", icon: "layers", title: "No interceptors registered", text: "Decorators only record metadata until an interceptor is registered for them." }));
}

function intentUnavailable(reason) {
  return h("div", { class: "card", id: "intent-empty" },
    emptyState({ icon: "shield", title: "Intent reporting is not enabled", text: reason || "The app did not return a runtime report." }),
    h("div", { class: "card-b", style: "padding-top:0" },
      h("p", { class: "muted", style: "margin:0 0 8px;font-size:13px" }, rich("Load ", ["code", "@axiljs/runtime"], " in the app, wire the classes whose decorators should be enforced, and in development expose the report to Studio:")),
      codeBlock(INTENT_SETUP, "nowrap"),
      h("div", { class: "row", style: "margin-top:10px" }, btn("Copy snippet", { icon: "copy", cls: "btn-sm", onclick: function () { copyText(INTENT_SETUP, "Snippet copied") } }))));
}

function intentBody(st) {
  var d = st.data;
  if (!d) {
    if (st.error) return h("div", { class: "alert" }, ic("error"), h("div", null, h("b", { text: "Couldn't load the intent report" }), h("pre", { text: st.error })));
    return [h("div", { class: "stats" }, [0, 1, 2, 3].map(function () { return h("div", { class: "skel skel-card" }) })), h("div", { class: "card card-b" }, skelLines(5))];
  }
  if (!d.available) return intentUnavailable(d.reason);
  var circuits = d.circuits || {};
  var cnames = Object.keys(circuits);
  var open = cnames.filter(function (n) { return circuits[n] === "OPEN" }).length;
  var half = cnames.filter(function (n) { return circuits[n] === "HALF_OPEN" }).length;
  var breaching = d.slo.filter(function (s) { return s.meetsLatency === false || s.meetsErrorBudget === false }).length;
  var last = d.violations.length ? d.violations[d.violations.length - 1] : null;
  return [
    st.error ? h("div", { class: "alert", style: "margin-bottom:16px" }, ic("error"), h("div", null, h("b", { text: "Live updates paused" }), h("pre", { text: st.error }))) : null,
    h("div", { class: "stats", id: "intent-stats" },
      intentStat("alert", "Violations", fmtNum(d.violations.length), last ? "last at " + intentTime(last.timestamp) + " · " + (last.decorator || "") : "none recorded", d.violations.length ? "intent-warn" : ""),
      intentStat("clock", "SLOs", d.slo.length ? fmtNum(d.slo.length - breaching) + " / " + fmtNum(d.slo.length) : "0", d.slo.length ? (breaching ? plural(breaching, "target") + " breaching" : "all meeting their objective") : "no tSlo methods called yet", breaching ? "intent-warn" : ""),
      intentStat("plug", "Circuits", fmtNum(cnames.length), cnames.length ? open + " open · " + half + " half-open" : "no breakers tripped or tracked", open ? "intent-warn" : ""),
      intentStat("layers", "Enforced decorators", fmtNum(d.enforced.length), "interceptors registered")),
    intentViolationsCard(d.violations),
    h("div", { style: "height:16px" }),
    intentSloCard(d.slo),
    h("div", { class: "ov-grid", style: "margin-top:16px" }, intentCircuitsCard(circuits), intentEnforcedCard(d.enforced))
  ];
}

defineView("intent", {
  title: "Intent", icon: "shield", key: "i",
  render: function (el) {
    var st = intentState();
    var badgeSlot = h("span");
    var meta = h("span", { class: "muted", style: "font-size:12px;white-space:nowrap" });
    var body = h("div");
    function drawMeta() {
      var d = st.data;
      meta.textContent = st.at ? (d && d.available ? (d.source === "in-process" ? "in-process" : "from app") + " · " : "") + "updated " + clock(st.at) + " · every 2 s" : "";
    }
    function draw() {
      var d = st.data;
      mount(badgeSlot, d && d.available ? intentModeBadge(d.mode) : null);
      drawMeta();
      mount(body, intentBody(st));
    }
    function tick() {
      if (st.busy || document.hidden || !document.contains(el)) return;
      st.busy = true;
      getJSON("/api/studio/intent").then(function (d) {
        var sig = intentSig(d);
        var changed = sig !== st.sig || !!st.error;
        st.data = d; st.sig = sig; st.error = null; st.at = Date.now();
        if (!document.contains(el)) return;
        if (changed) draw(); else drawMeta();
      }, function (e) {
        st.error = e.message || String(e);
        if (document.contains(el)) draw();
      }).finally(function () { st.busy = false });
    }
    mount(el, h("div", { class: "page-inner" },
      pageHeader("Intent", "Live check that the running app keeps the contracts its decorators declare.",
        [meta, btn("Refresh", { icon: "refresh", cls: "btn-sm", onclick: function () { st.sig = ""; tick() } })], badgeSlot),
      body));
    draw();
    tick();
    var timer = setInterval(tick, INTENT_POLL_MS);
    var onVis = function () { if (!document.hidden) tick() };
    document.addEventListener("visibilitychange", onVis);
    S.cleanup.push(function () { clearInterval(timer); document.removeEventListener("visibilitychange", onVis) });
  }
});
`
