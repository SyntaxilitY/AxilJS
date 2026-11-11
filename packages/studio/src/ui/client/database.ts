/**
 * Client runtime — Database browser: table list, data grid (server-side sort,
 * search, filters, pagination), structure and relations tabs.
 */
export const DATABASE = String.raw`
var OPS = [
  ["eq", "=", "equals"], ["neq", "≠", "not equal"], ["contains", "contains", "contains"], ["starts", "starts with", "starts with"],
  ["gt", ">", "greater than"], ["gte", "≥", "greater or equal"], ["lt", "<", "less than"], ["lte", "≤", "less or equal"],
  ["null", "is null", "is null"], ["notnull", "is not null", "is not null"]
];
function opLabel(op) { var o = OPS.filter(function (x) { return x[0] === op })[0]; return o ? o[1] : op }
function noValueOp(op) { return op === "null" || op === "notnull" }

function tableState(name) {
  if (!S.db[name]) S.db[name] = { page: 0, size: store.get("page-size", 50), sort: null, dir: "asc", q: "", filters: [], hidden: store.get("hidden:" + name, {}), appliedF: null, rows: null, total: 0, error: null, seq: 0 };
  return S.db[name];
}
function noDatabase() {
  return emptyState({
    cls: "fill", icon: "database", title: "No database connected",
    text: rich("Studio didn't find any tables. Point it at your database with ", ["code", "dbDriver"], " plus ", ["code", "dbFile"], " (SQLite) or ", ["code", "dbUrl"], " (Postgres / MySQL), then refresh."),
    action: btn("Refresh", { icon: "refresh", cls: "btn-sm", onclick: function () { refresh(true) } })
  });
}

defineView("database", {
  title: "Database", icon: "database", key: "d", full: true,
  render: function (el, route) {
    if (!S.data) { mount(el, h("div", { class: "pane pane-l narrow" }, h("div", { class: "pane-h" }, h("div", { class: "skel", style: "height:30px" })), h("div", { style: "padding:12px" }, skelLines(6))), h("div", { class: "workspace" }, h("div", { style: "padding:20px" }, skelLines(10)))); return }
    var tables = allTables();
    if (!tables.length) { mount(el, h("div", { class: "workspace" }, noDatabase())); return }
    var name = route.parts[0] || null;
    var t = name ? tableInfo(name) : null;
    var tab = route.parts[1] === "structure" || route.parts[1] === "relations" ? route.parts[1] : "data";
    if (t) el.classList.add("has-sel");

    /* table list */
    var q = h("input", { class: "input sm", type: "search", placeholder: "Search tables…", "aria-label": "Search tables", spellcheck: "false", value: S.dbListQ || "" });
    var listEl = h("div", { class: "pane-b", role: "navigation", "aria-label": "Tables" });
    function drawList() {
      var s = (S.dbListQ || "").toLowerCase();
      var list = tables.filter(function (x) { return !s || x.name.toLowerCase().indexOf(s) >= 0 });
      mount(listEl, list.length ? list.map(function (x) {
        return h("a", { class: "tbl-item" + (x.name === name ? " active" : ""), href: dbHash(x.name), title: x.name },
          ic("table"), h("span", { class: "nm", text: x.name }),
          h("span", { class: "meta" }, fmtNum(x.rowCount || 0), h("br"), h("span", { class: "faint", text: (x.columns || []).length + " cols" })));
      }) : emptyState({ cls: "sm", icon: "search", text: "No tables match." }));
    }
    q.addEventListener("input", function () { S.dbListQ = q.value; drawList() });
    drawList();
    var pane = h("div", { class: "pane pane-l narrow collapsible-sel" },
      h("div", { class: "pane-h" }, h("div", { class: "pane-title" }, "Tables", h("span", { class: "sp" }), h("span", { class: "muted", style: "font-weight:500", text: tables.length })), h("div", { class: "search" }, ic("search"), q)),
      listEl);
    var ws = h("div", { class: "workspace collapsible-ws" });
    mount(el, pane, ws);

    if (!name) {
      setCrumbs([{ label: "Database" }]);
      mount(ws, emptyState({ cls: "fill", icon: "table", title: "Select a table", text: plural(tables.length, "table") + " · " + plural(totalRows(), "row") + " in " + (S.data.dbDriver || "the database") + ". Pick one to browse its data, structure and relations." }));
      return;
    }
    if (!t) {
      setCrumbs([{ label: "Database", href: "#/database" }, { label: name, mono: true }]);
      mount(ws, emptyState({ cls: "fill err", icon: "alert", title: "Table not found", text: rich("There is no table named ", ["code", name], "."), action: h("a", { class: "btn btn-sm", href: "#/database", text: "Back to tables" }) }));
      return;
    }
    setCrumbs([{ label: "Database", href: "#/database" }, { label: name, mono: true, href: dbHash(name) }].concat(tab === "data" ? [] : [{ label: tab === "structure" ? "Structure" : "Relations" }]));

    var st = tableState(name);
    var fRaw = route.query.f || "";
    if (fRaw !== (st.appliedF || "")) {
      st.appliedF = fRaw;
      var parsed = [];
      try { parsed = fRaw ? JSON.parse(fRaw) : [] } catch (e) { parsed = [] }
      st.filters = Array.isArray(parsed) ? parsed.filter(function (f) { return f && typeof f.column === "string" && typeof f.op === "string" }) : [];
      st.page = 0;
    }
    var rel = fksOf(name).length + incomingFks(name).length;
    var head = h("div", { class: "db-head" },
      h("a", { class: "btn btn-sm btn-ghost mobile-back", href: "#/database" }, ic("arrowLeft"), h("span", { text: "Tables" })),
      h("div", { class: "db-title" }, ic("table"), h("h1", { text: name, title: name }),
        badge(plural(t.rowCount || 0, "row"), "ghost"), badge(plural((t.columns || []).length, "column"), "ghost")),
      h("div", { class: "row" },
        btn("Query in SQL", { icon: "sql", cls: "btn-sm", onclick: function () { openInSql("SELECT *\nFROM " + quoteIdent(name) + "\nLIMIT 100;") } })));
    var tabs = h("div", { class: "tabs db-tabs", role: "tablist" },
      [["data", "Data", "rows"], ["structure", "Structure", "columns"], ["relations", "Relations", "link"]].map(function (x) {
        return h("a", { class: "tab" + (tab === x[0] ? " active" : ""), role: "tab", "aria-selected": tab === x[0] ? "true" : "false", href: dbHash(name, x[0] === "data" ? st.filters : null, x[0] === "data" ? null : x[0]) },
          ic(x[2]), x[1], x[0] === "relations" && rel ? h("span", { class: "cnt", text: rel }) : x[0] === "structure" ? h("span", { class: "cnt", text: (t.columns || []).length }) : null);
      }));
    var body = h("div", { style: "flex:1;display:flex;flex-direction:column;min-height:0" });
    mount(ws, head, tabs, body);
    if (tab === "structure") renderStructure(body, t);
    else if (tab === "relations") renderRelations(body, t);
    else renderData(body, t, st);
  }
});
function quoteIdent(n) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : '"' + String(n).replace(/"/g, '""') + '"' }

function syncFilterHash(name, st) {
  var hash = dbHash(name, st.filters);
  st.appliedF = st.filters.length ? JSON.stringify(st.filters) : "";
  replaceHash(hash);
}

function renderData(body, t, st) {
  var name = t.name;
  var cols = gridColumns(name);
  var colNames = cols.map(function (c) { return c.name });

  var search = h("input", { class: "input sm", type: "search", placeholder: "Search all columns…", value: st.q, "aria-label": "Search rows", spellcheck: "false" });
  search.addEventListener("input", debounce(function () { st.q = search.value.trim(); st.page = 0; fetchRows() }, 300));
  var filterBtn = btn("Filter", { icon: "filter", cls: "btn-sm" + (st.filters.length ? " on" : ""), onclick: function () { openFilterMenu(filterBtn) } });
  var colBtn = btn("Columns", { icon: "columns", cls: "btn-sm", onclick: function () { openColumnsMenu(colBtn) } });
  var expBtn = btn("Export", { icon: "download", cls: "btn-sm", onclick: function () { openExportMenu(expBtn) } });
  var toolbar = h("div", { class: "toolbar" },
    h("div", { class: "search" }, ic("search"), search),
    filterBtn, colBtn, h("span", { class: "sp" }), expBtn,
    iconBtn("refresh", "Reload rows", function () { fetchRows() }, "sm"));
  var filtersBar = h("div", { class: "filters" });
  var gridWrap = h("div", { class: "grid-wrap" });
  var foot = h("div", { class: "gfoot" });
  mount(body, toolbar, filtersBar, gridWrap, foot);

  function drawFilters() {
    filterBtn.classList.toggle("on", st.filters.length > 0);
    filtersBar.style.display = st.filters.length ? "" : "none";
    mount(filtersBar, h("span", { class: "muted", style: "font-size:12px;margin-right:2px", text: "Where" }),
      st.filters.map(function (f, i) {
        return h("span", { class: "fchip" }, h("span", { class: "c", text: f.column }), h("span", { class: "o", text: opLabel(f.op) }),
          noValueOp(f.op) ? null : h("span", { class: "v", text: String(f.value), title: String(f.value) }),
          iconBtn("x", "Remove filter", function () { st.filters.splice(i, 1); st.page = 0; syncFilterHash(name, st); drawFilters(); fetchRows() }, "sm"));
      }),
      st.filters.length > 1 ? btn("Clear all", { cls: "btn-xs btn-ghost", onclick: function () { st.filters = []; st.page = 0; syncFilterHash(name, st); drawFilters(); fetchRows() } }) : null);
  }
  function openFilterMenu(anchor) {
    openMenu(anchor, function (close) {
      var col = h("select", { class: "select sm", "aria-label": "Column" }, colNames.map(function (c) { return h("option", { value: c, text: c }) }));
      var op = h("select", { class: "select sm", "aria-label": "Operator" }, OPS.map(function (o) { return h("option", { value: o[0], text: o[2] }) }));
      var val = h("input", { class: "input sm mono", placeholder: "value", "aria-label": "Value", spellcheck: "false" });
      var applyOp = function () { val.style.display = noValueOp(op.value) ? "none" : "" };
      op.addEventListener("change", applyOp);
      var addIt = function () {
        if (!noValueOp(op.value) && val.value === "") { val.focus(); return }
        var f = { column: col.value, op: op.value };
        if (!noValueOp(op.value)) f.value = val.value;
        st.filters.push(f); st.page = 0; syncFilterHash(name, st); close(); drawFilters(); fetchRows();
      };
      val.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addIt() } });
      return h("div", { class: "menu-form" }, h("label", { text: "Column" }), col, h("label", { text: "Condition" }), op, val,
        h("div", { class: "row", style: "justify-content:flex-end;margin-top:4px" }, btn("Cancel", { cls: "btn-sm btn-ghost", onclick: close }), btn("Add filter", { icon: "plus", cls: "btn-sm btn-primary", onclick: addIt })));
    }, { width: 260 });
  }
  function openColumnsMenu(anchor) {
    openMenu(anchor, function () {
      var wrap = h("div");
      function draw() {
        mount(wrap, h("div", { class: "menu-h", text: "Visible columns" }),
          cols.map(function (c) {
            var cb = h("input", { type: "checkbox", checked: !st.hidden[c.name] });
            cb.addEventListener("change", function () {
              if (cb.checked) delete st.hidden[c.name]; else st.hidden[c.name] = 1;
              store.set("hidden:" + name, st.hidden); drawGrid();
            });
            return h("label", { class: "menu-it check" }, cb, h("span", { class: "mono ellipsis", text: c.name }), h("small", { text: (c.type || "").toLowerCase() }));
          }),
          h("div", { class: "menu-sep" }),
          menuItem("Show all columns", "eye", function () { st.hidden = {}; store.set("hidden:" + name, {}); drawGrid(); draw() }));
      }
      draw();
      return wrap;
    }, { width: 240, alignRight: false });
  }
  function openExportMenu(anchor) {
    openMenu(anchor, function (close) {
      var rows = st.rows || [];
      var vis = cols.filter(function (c) { return !st.hidden[c.name] }).map(function (c) { return c.name });
      var pick = function () { return rows.map(function (r) { var o = {}; vis.forEach(function (c) { o[c] = r[c] }); return o }) };
      var suffix = st.page ? "-p" + (st.page + 1) : "";
      return [h("div", { class: "menu-h", text: "Current page · " + plural(rows.length, "row") }),
        menuItem("Download CSV", "download", function () { close(); if (!rows.length) return toast("Nothing to export", "warn"); download(name + suffix + ".csv", toCSV(pick(), vis), "text/csv"); toast("CSV exported", "success") }, ".csv"),
        menuItem("Download JSON", "download", function () { close(); if (!rows.length) return toast("Nothing to export", "warn"); download(name + suffix + ".json", JSON.stringify(pick(), null, 2), "application/json"); toast("JSON exported", "success") }, ".json"),
        h("div", { class: "menu-sep" }),
        menuItem("Copy as JSON", "copy", function () { close(); copyText(JSON.stringify(pick(), null, 2), plural(rows.length, "row") + " copied") }),
        menuItem("Copy as CSV", "copy", function () { close(); copyText(toCSV(pick(), vis), plural(rows.length, "row") + " copied") })];
    }, { width: 230, alignRight: true });
  }

  function drawGrid() {
    if (st.error) {
      mount(gridWrap, h("div", { class: "grid-err" }, h("div", { class: "alert" }, ic("error"),
        h("div", { class: "grow" }, h("b", { text: "Couldn't load rows" }), h("pre", { text: st.error }),
          st.filters.length || st.q || st.sort ? h("div", { style: "margin-top:10px" }, btn("Reset filters & sort", { cls: "btn-sm", onclick: function () { st.filters = []; st.q = ""; search.value = ""; st.sort = null; st.page = 0; syncFilterHash(name, st); drawFilters(); fetchRows() } })) : null))));
      return;
    }
    if (!st.rows) return;
    if (!st.rows.length) {
      mount(gridWrap, st.filters.length || st.q
        ? emptyState({ icon: "filter", title: "No matching rows", text: "No rows match the current search and filters.", action: btn("Clear filters", { cls: "btn-sm", onclick: function () { st.filters = []; st.q = ""; search.value = ""; st.page = 0; syncFilterHash(name, st); drawFilters(); fetchRows() } }) })
        : emptyState({ icon: "rows", title: "This table is empty", text: rich("Insert rows from your app or a seed script — ", ["code", name], " has no data yet.") }));
      return;
    }
    var scroll = gridWrap.scrollLeft;
    mount(gridWrap, dataGrid({
      columns: cols, rows: st.rows, offset: st.page * st.size, sort: st.sort, dir: st.dir, hidden: st.hidden,
      onSort: function (c) {
        if (st.sort !== c) { st.sort = c; st.dir = "asc" } else if (st.dir === "asc") st.dir = "desc"; else { st.sort = null; st.dir = "asc" }
        st.page = 0; fetchRows();
      },
      onRow: function (row) {
        var pk = cols.filter(function (c) { return c.primary })[0];
        rowDrawer(name + (pk && row[pk.name] != null ? " #" + row[pk.name] : ""), row, cols);
      }
    }));
    gridWrap.scrollLeft = scroll;
  }
  function drawFoot() {
    var total = st.total || 0;
    var pages = Math.max(1, Math.ceil(total / st.size));
    var from = total ? st.page * st.size + 1 : 0, to = Math.min(total, (st.page + 1) * st.size);
    var size = h("select", { class: "select sm", "aria-label": "Rows per page" }, [25, 50, 100, 250].map(function (n) { return h("option", { value: n, text: n + " / page", selected: n === st.size }) }));
    size.addEventListener("change", function () { st.size = Number(size.value); store.set("page-size", st.size); st.page = 0; fetchRows() });
    var jump = h("input", { class: "input sm num", value: String(st.page + 1), "aria-label": "Page number", inputmode: "numeric" });
    var goPage = function (p) { p = Math.max(0, Math.min(pages - 1, p)); if (p !== st.page) { st.page = p; fetchRows() } else jump.value = String(st.page + 1) };
    jump.addEventListener("keydown", function (e) { if (e.key === "Enter") goPage(parseInt(jump.value, 10) - 1 || 0) });
    jump.addEventListener("blur", function () { jump.value = String(st.page + 1) });
    var hidden = Object.keys(st.hidden).filter(function (k) { return colNames.indexOf(k) >= 0 }).length;
    mount(foot,
      h("span", null, total ? h("b", { class: "num", text: fmtNum(from) + "–" + fmtNum(to) }) : h("b", { text: "0" }), " of ", h("b", { class: "num", text: fmtNum(total) }), " rows"),
      st.sort ? h("span", { class: "ps" }, "· sorted by ", h("code", { text: st.sort }), " " + st.dir) : null,
      hidden ? h("span", { class: "ps", text: "· " + hidden + " hidden column" + (hidden > 1 ? "s" : "") }) : null,
      h("div", { class: "pager" }, size,
        iconBtn("chevronLeft", "Previous page", function () { goPage(st.page - 1) }, "sm"),
        h("span", null, "Page "), jump, h("span", { text: " of " + fmtNum(pages) }),
        iconBtn("chevronRight", "Next page", function () { goPage(st.page + 1) }, "sm")));
    var btns = $$(".pager .icon-btn", foot); btns[0].disabled = st.page <= 0; btns[1].disabled = st.page >= pages - 1;
  }
  function skeleton() {
    var n = Math.min(12, st.size);
    var vis = cols.filter(function (c) { return !st.hidden[c.name] });
    mount(gridWrap, h("table", { class: "grid", style: "pointer-events:none" },
      h("thead", null, h("tr", null, h("th", { class: "rn", text: "#" }), vis.map(function (c) { return h("th", null, h("span", { class: "th" }, c.name)) }))),
      h("tbody", null, Array.apply(null, Array(n)).map(function (_, i) { return h("tr", null, h("td", { class: "rn" }), vis.map(function (c, j) { return h("td", null, h("div", { class: "skel", style: "height:10px;width:" + (40 + ((i * 7 + j * 13) % 50)) + "px" })) })) }))));
  }
  function fetchRows() {
    var seq = ++st.seq;
    if (!st.rows) skeleton(); else gridWrap.style.opacity = ".55";
    var params = ["limit=" + st.size, "offset=" + st.page * st.size];
    if (st.sort) params.push("sort=" + encodeURIComponent(st.sort), "dir=" + st.dir);
    if (st.q) params.push("q=" + encodeURIComponent(st.q));
    if (st.filters.length) params.push("filter=" + encodeURIComponent(JSON.stringify(st.filters)));
    getJSON("/api/studio/table/" + encodeURIComponent(name) + "?" + params.join("&")).then(function (res) {
      if (seq !== st.seq) return;
      st.error = null; st.rows = res.rows || []; st.total = res.total || 0;
      var pages = Math.max(1, Math.ceil(st.total / st.size));
      if (st.page > pages - 1 && st.total) { st.page = pages - 1; fetchRows(); return }
    }).catch(function (e) {
      if (seq !== st.seq) return;
      st.error = e.message; st.rows = []; st.total = 0;
    }).finally(function () {
      if (seq !== st.seq || !document.contains(gridWrap)) return;
      gridWrap.style.opacity = "";
      drawGrid(); drawFoot();
      if (!st.error) gridWrap.scrollTop = 0;
    });
  }
  drawFilters();
  if (st.rows && !st.error) { drawGrid(); drawFoot() } else { st.rows = null; drawFoot() }
  fetchRows();
}

function renderStructure(body, t) {
  var fks = fkMap(t.name);
  var schemaOk = S.schemaState === "ok";
  var tinfo = tableInfo(t.name) || t;
  var idx = tinfo.indexes || [];
  var colsCard = h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("columns"), "Columns"), h("span", { class: "muted", style: "font-size:12px", text: plural((t.columns || []).length, "column") })),
    h("div", { class: "tbl-scroll" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, h("th", { text: "#" }), h("th", { text: "Name" }), h("th", { text: "Type" }), h("th", { text: "Constraints" }), h("th", { text: "Default" }), h("th", { text: "References" }))),
      h("tbody", null, (t.columns || []).map(function (c, i) {
        var fk = fks[c.name];
        return h("tr", null,
          h("td", { class: "muted num", style: "width:40px", text: i + 1 }),
          h("td", { class: "mono", style: "font-weight:600" }, c.name),
          h("td", { class: "mono muted", text: c.type || "—" }),
          h("td", null, h("span", { class: "badges" },
            c.primary ? badge("PRIMARY KEY", "pk", "key") : null,
            c.unique && !c.primary ? badge("UNIQUE", "uq") : null,
            fk ? badge("FOREIGN KEY", "fk", "link") : null,
            c.primary ? null : c.nullable ? badge("NULL", "ghost") : badge("NOT NULL", ""))),
          h("td", { class: "mono" }, c.default != null ? String(c.default) : h("span", { class: "faint", text: "—" })),
          h("td", null, fk ? h("a", { class: "fklink", href: dbHash(fk.refTable, null, "structure") }, fk.refTable + "." + fk.refColumn, ic("arrowRight")) : h("span", { class: "faint", text: "—" })));
      })))));
  var fkCard = h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("link"), "Foreign keys")),
    !schemaOk ? emptyState({ cls: "sm", icon: "info", text: "Foreign-key metadata is unavailable (the /api/studio/schema endpoint did not respond)." }) :
      (tinfo.foreignKeys || []).length ? h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", { text: "Column" }), h("th", { text: "References" }))),
        h("tbody", null, tinfo.foreignKeys.map(function (fk) {
          return h("tr", null, h("td", { class: "mono", text: fk.column }), h("td", null, h("a", { class: "fklink", href: dbHash(fk.refTable) }, fk.refTable + "." + fk.refColumn, ic("arrowRight"))));
        }))) : emptyState({ cls: "sm", icon: "link", text: "This table doesn't reference other tables." }));
  var idxCard = h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("bookmark"), "Indexes")),
    !schemaOk ? emptyState({ cls: "sm", icon: "info", text: "Index metadata is unavailable." }) :
      idx.length ? h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", { text: "Name" }), h("th", { text: "Columns" }), h("th", { text: "Type" }))),
        h("tbody", null, idx.map(function (x) {
          return h("tr", null, h("td", { class: "mono", text: x.name }), h("td", null, h("span", { class: "badges" }, (x.columns || []).map(function (c) { return h("span", { class: "tag", text: c }) }))), h("td", null, x.unique ? badge("UNIQUE", "uq") : badge("INDEX", "ghost")));
        }))) : emptyState({ cls: "sm", icon: "bookmark", text: "No secondary indexes. Primary keys are indexed implicitly." }));
  mount(body, h("div", { class: "scroll-pad" }, colsCard, h("div", { class: "rel-grid" }, fkCard, idxCard)));
}

function renderRelations(body, t) {
  if (S.schemaState !== "ok") { mount(body, emptyState({ cls: "fill", icon: "link", title: "Relations unavailable", text: "Foreign-key metadata could not be loaded from /api/studio/schema." })); return }
  var out = fksOf(t.name), inc = incomingFks(t.name);
  function relRow(fromT, fromC, toT, toC, target) {
    return h("a", { class: "rel", href: dbHash(target) },
      h("span", null, h("span", { class: "t", text: fromT }), ".", h("span", { class: "c", text: fromC })),
      ic("arrowRight"),
      h("span", null, h("span", { class: "t", text: toT }), ".", h("span", { class: "c", text: toC })),
      h("span", { class: "sp" }), h("span", { class: "muted", style: "font-family:var(--font);font-size:12px", text: "Open " + target }));
  }
  mount(body, h("div", { class: "scroll-pad" },
    h("div", { class: "rel-grid" },
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("arrowRight"), "References"), h("span", { class: "muted", style: "font-size:12px", text: out.length + " outgoing" })),
        out.length ? out.map(function (fk) { return relRow(t.name, fk.column, fk.refTable, fk.refColumn, fk.refTable) })
          : emptyState({ cls: "sm", icon: "link", text: t.name + " doesn't reference other tables." })),
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("div", { class: "h2" }, ic("arrowLeft"), "Referenced by"), h("span", { class: "muted", style: "font-size:12px", text: inc.length + " incoming" })),
        inc.length ? inc.map(function (x) { return relRow(x.table, x.column, t.name, x.refColumn, x.table) })
          : emptyState({ cls: "sm", icon: "link", text: "No other table references " + t.name + "." }))),
    h("div", { class: "hint" }, ic("info"), "Foreign-key cells in the Data tab link straight to the referenced row.")));
}
`
