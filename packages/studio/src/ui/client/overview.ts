/**
 * Client runtime — Overview, Export and QR views.
 */
export const OVERVIEW = String.raw`
function pageHeader(title, sub, actions, extra) {
  return h("div", { class: "ph" },
    h("div", { class: "ph-text" }, h("h1", null, title, extra || null), sub ? h("p", null, sub) : null),
    actions ? h("div", { class: "ph-actions" }, actions) : null);
}
function overviewSkeleton(el) {
  mount(el, h("div", { class: "page-inner" },
    h("div", { class: "ph" }, h("div", { class: "ph-text" }, h("div", { class: "skel", style: "height:24px;width:220px;margin-bottom:8px" }), h("div", { class: "skel", style: "height:14px;width:340px" }))),
    h("div", { class: "stats" }, [0, 1, 2, 3].map(function () { return h("div", { class: "skel skel-card" }) })),
    h("div", { class: "ov-grid" }, h("div", { class: "card card-b" }, skelLines(6)), h("div", { class: "card card-b" }, skelLines(6)))));
}
function routeGroup(path) { var seg = String(path).split("/").filter(Boolean)[0]; return seg ? "/" + seg : "/" }

defineView("overview", {
  title: "Overview", icon: "overview", key: "o",
  render: function (el) {
    if (!S.data) return overviewSkeleton(el);
    var d = S.data, tables = allTables();
    var rows = totalRows();
    var mcount = {}; d.routes.forEach(function (r) { var m = mcls(r.method); mcount[m] = (mcount[m] || 0) + 1 });
    var secured = d.routes.filter(function (r) { return (r.middleware || []).some(function (m) { return /auth/i.test(m) }) }).length;
    var colTotal = tables.reduce(function (a, t) { return a + (t.columns || []).length }, 0);
    var fkTotal = tables.reduce(function (a, t) { return a + (t.foreignKeys || []).length }, 0);
    var started = d.startedAt ? new Date(d.startedAt) : null;

    function stat(href, icon, label, val, sub, extra) {
      return h("a", { class: "card stat", href: href },
        h("div", { class: "stat-top" }, h("span", { text: label }), h("span", { class: "stat-ico" }, ic(icon))),
        h("div", { class: "stat-val", text: val }), h("div", { class: "stat-sub" }, sub), extra || null);
    }
    var order = METHODS.concat(["OTHER"]).filter(function (m) { return mcount[m] });
    var mbar = d.routes.length ? h("div", null,
      h("div", { class: "mbar", role: "img", "aria-label": order.map(function (m) { return mcount[m] + " " + m }).join(", ") },
        order.map(function (m) { return h("span", { class: "mbg " + m, style: "flex:" + mcount[m], title: mcount[m] + " " + m }) })),
      h("div", { class: "mlegend" }, order.map(function (m) { return h("span", null, h("i", { class: "mbg " + m }), m + " " + mcount[m]) }))) : null;

    var quick = [
      ["#/endpoints", "send", "Try an endpoint", "Build requests and inspect responses"],
      ["#/database", "table", "Browse data", "Filter, sort and export table rows"],
      ["#/schema", "schema", "Schema diagram", "Tables and foreign-key relations"],
      ["#/sql", "sql", "SQL console", "Read-only queries with history"],
      ["#/realtime", "realtime", "Realtime", "Test WebSocket and SSE channels"],
      ["#/export", "export", "Export", "Postman, Insomnia and OpenAPI"]
    ];
    var largest = tables.slice().sort(function (a, b) { return (b.rowCount || 0) - (a.rowCount || 0) }).slice(0, 6);
    var maxRows = largest.length ? Math.max(1, largest[0].rowCount || 0) : 1;
    var hist = store.get("sql-history", []).slice(0, 5);
    var groups = {}, gorder = [];
    d.routes.forEach(function (r) { var g = routeGroup(r.path); if (!groups[g]) { groups[g] = []; gorder.push(g) } groups[g].push(r) });

    mount(el, h("div", { class: "page-inner" },
      pageHeader(d.appName, h("span", null,
        started ? "Studio started " + ago(started.getTime()) + " · " : "",
        "app at ", h("a", { href: d.appUrl, target: "_blank", rel: "noopener noreferrer", class: "mono", text: d.appUrl })),
        [btn("Export", { icon: "download", cls: "btn-sm", onclick: function () { go("#/export") } }),
          btn("SQL console", { icon: "sql", cls: "btn-sm btn-primary", onclick: function () { go("#/sql") } })],
        d.dbDriver ? badge(d.dbDriver, "accent", "database") : badge("no database", "", "database")),
      h("div", { class: "stats" },
        stat("#/endpoints", "endpoints", "Endpoints", fmtNum(d.routes.length), secured ? secured + " behind auth middleware" : "HTTP routes discovered", mbar),
        stat("#/database", "database", "Tables", fmtNum(tables.length), plural(colTotal, "column") + (fkTotal ? " · " + plural(fkTotal, "relation") : "")),
        stat("#/database", "rows", "Total rows", fmtNum(rows), tables.length ? "across " + plural(tables.length, "table") : "no database connected"),
        stat("#/realtime", "realtime", "Realtime channels", fmtNum(d.websockets.length + d.sse.length), d.websockets.length + " WebSocket · " + d.sse.length + " SSE")),
      h("div", { class: "ov-grid" },
        h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("wand"), "Quick links")),
          h("div", { class: "quick" }, quick.map(function (q) {
            return h("a", { href: q[0] }, h("span", { class: "qi" }, ic(q[1])), h("span", null, h("b", { text: q[2] }), h("small", { text: q[3] })));
          }))),
        h("div", { class: "card bars" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("rows"), "Largest tables"), h("a", { class: "btn btn-xs btn-ghost", href: "#/database", text: "All tables" })),
          largest.length ? largest.map(function (t) {
            return h("a", { class: "list-row", href: dbHash(t.name) },
              ic("table", 14, "muted"), h("span", { class: "grow mono ellipsis", text: t.name }), h("span", { class: "num muted", text: fmtNum(t.rowCount || 0) }),
              h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: "width:" + Math.max(2, Math.round((t.rowCount || 0) / maxRows * 100)) + "%" })));
          }) : emptyState({ cls: "sm", icon: "database", title: "No database connected", text: rich("Set ", ["code", "dbDriver"], " and ", ["code", "dbFile"], " / ", ["code", "dbUrl"], " in the Studio config.") }))),
      h("div", { class: "ov-grid" },
        h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("history"), "Recent queries"), h("a", { class: "btn btn-xs btn-ghost", href: "#/sql", text: "Open console" })),
          hist.length ? hist.map(function (q) {
            return h("button", { type: "button", class: "list-row", title: q.sql, onclick: function () { openInSql(q.sql) } },
              h("span", { class: "dot", style: "color:var(" + (q.ok === false ? "--err" : "--ok") + ")" }),
              h("span", { class: "hist-sql", text: q.sql.replace(/\s+/g, " ") }),
              h("span", { class: "muted num", style: "font-size:12px;white-space:nowrap", text: ago(q.t) }));
          }) : emptyState({ cls: "sm", icon: "sql", title: "No queries yet", text: "Queries you run in the SQL console show up here." })),
        h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("layers"), "Endpoints by resource"), h("a", { class: "btn btn-xs btn-ghost", href: "#/endpoints", text: "Explorer" })),
          gorder.length ? gorder.slice(0, 7).map(function (g) {
            var ms = {}; groups[g].forEach(function (r) { ms[r.method] = 1 });
            return h("a", { class: "list-row", href: epHash(groups[g][0]) },
              h("span", { class: "grow mono ellipsis", text: g }),
              h("span", { class: "row", style: "gap:3px" }, Object.keys(ms).map(function (m) { return h("span", { class: "mtext " + m, style: "font:700 10px var(--mono)", text: m }) })),
              h("span", { class: "nav-count", text: groups[g].length }));
          }) : emptyState({ cls: "sm", icon: "endpoints", title: "No routes found", text: rich("Studio scans ", ["code", "src/"], " for ", ["code", "router.get(…)"], "-style calls.") })))
    ));
  }
});

/* ── Export ──────────────────────────────────────────── */
var EXPORTS = {
  postman: { name: "Postman", desc: "Collection v2.1 — import via File › Import in Postman.", file: "postman-collection.json", icon: "postman" },
  insomnia: { name: "Insomnia", desc: "Export format v4 — import via Application › Import.", file: "insomnia-collection.json", icon: "insomnia" },
  openapi: { name: "OpenAPI 3.0", desc: "Swagger-compatible spec for docs, codegen and gateways.", file: "openapi.json", icon: "openapi" }
};
function fetchExport(kind) {
  if (S.exp.cache[kind]) return Promise.resolve(S.exp.cache[kind]);
  return getJSON("/api/studio/export/" + kind).then(function (d) { S.exp.cache[kind] = d; return d });
}
function exportDownload(kind) {
  fetchExport(kind).then(function (d) {
    download(EXPORTS[kind].file, JSON.stringify(d, null, 2), "application/json");
    toast(EXPORTS[kind].name + " export downloaded", "success");
  }).catch(function (e) { toast("Export failed: " + e.message, "error") });
}
function exportCopy(kind) {
  fetchExport(kind).then(function (d) { copyText(JSON.stringify(d, null, 2), EXPORTS[kind].name + " JSON copied") })
    .catch(function (e) { toast("Export failed: " + e.message, "error") });
}
function routesTable(routes) {
  if (!routes.length) return emptyState({ icon: "endpoints", title: "No endpoints to export", text: "Add routes to your app and refresh." });
  return h("div", { class: "tbl-scroll" }, h("table", { class: "tbl" },
    h("thead", null, h("tr", null, h("th", { text: "Method" }), h("th", { text: "Path" }), h("th", { text: "Handler" }), h("th", { text: "Middleware" }))),
    h("tbody", null, routes.map(function (r) {
      return h("tr", null, h("td", { style: "width:90px" }, methodPill(r.method)), h("td", null, h("a", { href: epHash(r) }, pathNode(r.path))),
        h("td", { class: "mono muted", text: r.handler || "—" }),
        h("td", null, h("span", { class: "row", style: "gap:4px;flex-wrap:wrap" }, (r.middleware || []).length ? r.middleware.map(function (m) { return h("span", { class: "tag" + (/auth/i.test(m) ? " auth" : ""), text: m }) }) : h("span", { class: "faint", text: "—" }))));
    }))));
}
defineView("export", {
  title: "Export", icon: "export", key: "x",
  render: function (el) {
    if (!S.data) return overviewSkeleton(el);
    var routes = S.data.routes;
    var preview = h("div");
    function drawPreview() {
      var tab = S.exp.tab;
      $$(".seg button", seg).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-k") === tab) });
      if (tab === "routes") { mount(preview, routesTable(routes)); return }
      mount(preview, h("div", { class: "card-b" }, skelLines(8)));
      fetchExport(tab).then(function (d) { if (S.exp.tab === tab) mount(preview, codeBlock(d, "nowrap")) })
        .catch(function (e) { mount(preview, h("div", { class: "card-b" }, h("div", { class: "alert" }, ic("error"), h("div", null, h("b", { text: "Couldn't generate export" }), h("pre", { text: e.message }))))) });
    }
    var seg = h("div", { class: "seg", role: "tablist" }, [["routes", "Endpoints"], ["postman", "Postman"], ["insomnia", "Insomnia"], ["openapi", "OpenAPI"]].map(function (t) {
      return h("button", { type: "button", "data-k": t[0], role: "tab", onclick: function () { S.exp.tab = t[0]; drawPreview() }, text: t[1] });
    }));
    mount(el, h("div", { class: "page-inner" },
      pageHeader("Export collections", "Generate ready-to-import API collections from the " + plural(routes.length, "discovered endpoint") + "."),
      h("div", { class: "exp-grid" }, Object.keys(EXPORTS).map(function (k) {
        var x = EXPORTS[k];
        return h("div", { class: "card exp" },
          h("div", { class: "exp-top" }, h("span", { class: "exp-ico " + k }, ic(x.icon)), h("div", { class: "grow" }, h("h3", { text: x.name }), h("div", { class: "muted", style: "font-size:12px", text: plural(routes.length, "endpoint") + " · " + x.file }))),
          h("p", { text: x.desc }),
          h("div", { class: "exp-acts" },
            btn("Download", { icon: "download", cls: "btn-sm btn-primary", onclick: function () { exportDownload(k) }, disabled: !routes.length }),
            btn("Copy JSON", { icon: "copy", cls: "btn-sm", onclick: function () { exportCopy(k) }, disabled: !routes.length })));
      })),
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("eye"), "Preview"), seg), preview)));
    drawPreview();
  }
});

/* ── QR ──────────────────────────────────────────────── */
function qrCard(title, url, src, loadFn) {
  var frame = h("div", { class: "qr-frame" });
  var setImg = function (s) {
    if (s && /^data:image\/(png|gif|jpeg|svg\+xml);base64,[A-Za-z0-9+\/=]+$/.test(s)) mount(frame, h("img", { src: s, alt: "QR code for " + url, width: "184", height: "184" }));
    else mount(frame, emptyState({ cls: "sm", icon: "qr", text: "QR unavailable — install the qrcode package." }));
  };
  if (src !== undefined) setImg(src);
  else { mount(frame, h("div", { class: "skel", style: "width:184px;height:184px" })); loadFn().then(setImg, function () { setImg(null) }) }
  return h("div", { class: "card qr" }, frame, h("h3", { text: title }), h("div", { class: "qr-url", text: url }),
    h("div", { class: "qr-acts" },
      btn("Copy URL", { icon: "copy", cls: "btn-sm", onclick: function () { copyText(url, "URL copied") } }),
      h("a", { class: "btn btn-sm btn-ghost", href: url, target: "_blank", rel: "noopener noreferrer" }, ic("external"), h("span", { text: "Open" }))));
}
defineView("qr", {
  title: "QR access", icon: "qr", key: "c",
  render: function (el) {
    var appUrl = (S.data && S.data.appUrl) || BOOT.appUrl;
    var studioUrl = BOOT.studioUrl;
    mount(el, h("div", { class: "page-inner" },
      pageHeader("QR access", "Scan to open the app or Studio on another device."),
      h("div", { class: "qr-grid" },
        qrCard("Application", appUrl, BOOT.qrDataUrl || null),
        qrCard("Studio", studioUrl, undefined, function () { return getJSON("/api/studio/qr?url=" + encodeURIComponent(studioUrl)).then(function (d) { return d.qrDataUrl }) })),
      h("div", { class: "alert info", style: "max-width:860px;margin-top:16px" }, ic("phone"),
        h("div", null, h("b", { text: "Scanning from a phone?" }),
          rich("Phones can't reach ", ["code", "localhost"], ". Use your computer's LAN address (for example ", ["code", "http://192.168.1.20:4799"], ") and make sure the server listens on ", ["code", "0.0.0.0"], ".")))));
  }
});
`
