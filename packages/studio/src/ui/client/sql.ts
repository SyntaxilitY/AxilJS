/**
 * Client runtime — read-only SQL console: highlighted editor, schema tree,
 * history, saved snippets and a shared result grid.
 */
export const SQL = String.raw`
function sqlState() {
  if (!S.sql) S.sql = { text: store.get("sql-draft", null), res: null, err: null, ms: 0, running: false, ran: "", side: store.get("sql-side", "schema"), open: {}, sort: null, dir: "asc", autorun: false };
  if (S.sql.text == null) { var t = allTables()[0]; S.sql.text = t ? "SELECT *\nFROM " + quoteIdent(t.name) + "\nLIMIT 50;" : "SELECT 1;" }
  return S.sql;
}
function openInSql(sql) { var st = sqlState(); st.text = sql; store.set("sql-draft", sql); st.autorun = true; go("#/sql") }
function sqlHistory() { return store.get("sql-history", []) }

function sqlEditor(st, onRun) {
  var gutter = h("div", { class: "ed-gutter", "aria-hidden": "true" });
  var hl = h("pre", { class: "ed-hl", "aria-hidden": "true" });
  var ta = h("textarea", { class: "ed-ta", spellcheck: "false", autocapitalize: "off", autocomplete: "off", wrap: "off", "aria-label": "SQL query", placeholder: "SELECT * FROM users LIMIT 10;" });
  ta.value = st.text;
  var lastLines = 0;
  var save = debounce(function () { store.set("sql-draft", ta.value) }, 400);
  function sync() {
    mount(hl, sqlNode(ta.value), "\n ");
    var n = ta.value.split("\n").length;
    if (n !== lastLines) { lastLines = n; var nodes = []; for (var i = 1; i <= n; i++) nodes.push(h("div", { text: i })); nodes.push(h("div", { style: "height:40px" })); mount(gutter, nodes) }
    scroll();
  }
  function scroll() { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop }
  ta.addEventListener("input", function () { st.text = ta.value; save(); sync() });
  ta.addEventListener("scroll", scroll);
  ta.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); var sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); onRun(sel.trim() ? sel : ta.value); return }
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); st.text = ta.value; save(); sync() }
  });
  sync();
  return {
    el: h("div", { class: "ed" }, gutter, h("div", { class: "ed-area" }, hl, ta)),
    ta: ta,
    insert: function (text) { ta.focus(); ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end"); st.text = ta.value; save(); sync() },
    set: function (text) { ta.value = text; st.text = text; save(); sync(); ta.focus() }
  };
}

defineView("sql", {
  title: "SQL console", icon: "sql", key: "q", full: true,
  render: function (el, route) {
    if (!S.data) { mount(el, h("div", { class: "workspace" }, h("div", { style: "padding:20px" }, skelLines(8)))); return }
    if (!allTables().length && !S.data.dbDriver) { mount(el, h("div", { class: "workspace" }, noDatabase())); return }
    var st = sqlState();
    var ed = sqlEditor(st, run);
    var resHead = h("div", { class: "sql-res-h" });
    var resBody = h("div", { class: "grid-wrap" });
    var side = h("div", { class: "pane-b" });
    var seg = h("div", { class: "seg", role: "tablist", style: "width:100%" });

    function run(sql) {
      sql = String(sql || "").trim();
      if (!sql) { toast("Write a query first", "warn"); return }
      if (st.running) return;
      st.running = true; st.ran = sql; drawResult();
      var t0 = performance.now();
      postJSON("/api/studio/query", { sql: sql }).then(function (res) {
        st.ms = performance.now() - t0;
        if (res && res.error) { st.err = String(res.error); st.res = null }
        else { st.err = null; st.res = { rows: (res && res.rows) || [], affected: (res && res.affected) || 0 }; st.sort = null }
      }).catch(function (e) { st.ms = performance.now() - t0; st.err = e.message; st.res = null })
        .finally(function () {
          st.running = false;
          var hist = sqlHistory().filter(function (x) { return x.sql !== sql });
          hist.unshift({ sql: sql, t: Date.now(), ok: !st.err, rows: st.res ? st.res.rows.length : 0, ms: Math.round(st.ms) });
          store.set("sql-history", hist.slice(0, 50));
          if (document.contains(resHead)) { drawResult(); if (st.side === "history") drawSide() }
        });
    }

    function sortedRows() {
      var rows = st.res.rows.slice();
      if (st.sort) {
        var c = st.sort, m = st.dir === "desc" ? -1 : 1;
        rows.sort(function (a, b) {
          var x = a[c], y = b[c];
          if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
          return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * m;
        });
      }
      return rows;
    }
    function drawResult() {
      if (st.running) {
        mount(resHead, h("span", { class: "row" }, ic("refresh", 14, "spin"), "Running query…"));
        resBody.style.opacity = ".5";
        return;
      }
      resBody.style.opacity = "";
      if (st.err) {
        mount(resHead, badge("Error", "err", "error"), h("span", { class: "num", text: fmtMs(st.ms) }));
        var readOnly = /only|read-?only|not allowed|outfile/i.test(st.err);
        mount(resBody, h("div", { class: "grid-err" }, h("div", { class: "alert" }, ic("error"), h("div", { class: "grow" },
          h("b", { text: readOnly ? "Query rejected" : "Query failed" }), h("pre", { text: st.err }),
          readOnly ? h("div", { class: "hint", style: "margin-top:8px" }, ic("lock"), "The console is read-only: SELECT, WITH, PRAGMA, EXPLAIN, SHOW and DESCRIBE are accepted.") : null))));
        return;
      }
      if (!st.res) {
        mount(resHead, h("span", { text: "Results" }));
        mount(resBody, emptyState({ icon: "play", title: "Run a query", text: h("span", null, "Press ", kbd("Ctrl"), " ", kbd("Enter"), " to run the whole editor, or select text to run just that part.") }));
        return;
      }
      var rows = st.res.rows;
      var cols = colsOf(rows).map(function (n) { return { name: n } });
      mount(resHead, badge(plural(rows.length, "row"), "ok", "check"), h("span", { class: "num", text: fmtMs(st.ms) }),
        st.res.affected ? h("span", { text: st.res.affected + " affected" }) : null,
        h("span", { class: "sp" }),
        rows.length ? [
          btn("CSV", { icon: "download", cls: "btn-xs", title: "Download CSV", onclick: function () { download("query-result.csv", toCSV(rows), "text/csv"); toast("CSV exported", "success") } }),
          btn("JSON", { icon: "download", cls: "btn-xs", title: "Download JSON", onclick: function () { download("query-result.json", JSON.stringify(rows, null, 2), "application/json"); toast("JSON exported", "success") } }),
          iconBtn("copy", "Copy rows as JSON", function () { copyText(JSON.stringify(rows, null, 2), plural(rows.length, "row") + " copied") }, "sm")] : null);
      if (!rows.length) { mount(resBody, emptyState({ icon: "rows", title: "No rows returned", text: "The query ran successfully but produced an empty result set." })); return }
      mount(resBody, dataGrid({
        columns: cols, rows: sortedRows(), sort: st.sort, dir: st.dir,
        onSort: function (c) { if (st.sort !== c) { st.sort = c; st.dir = "asc" } else if (st.dir === "asc") st.dir = "desc"; else st.sort = null; drawResult() },
        onRow: function (row, i) { rowDrawer("Result row " + (i + 1), row, cols) }
      }));
    }

    function drawSide() {
      $$("button", seg).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-k") === st.side) });
      if (st.side === "schema") {
        var tables = allTables();
        mount(side, tables.length ? tables.map(function (t) {
          var open = !!st.open[t.name], fks = fkMap(t.name);
          return h("div", null,
            h("div", { class: "row", style: "gap:0" },
              h("button", { type: "button", class: "tree-t" + (open ? " open" : ""), "aria-expanded": open ? "true" : "false", onclick: function () { st.open[t.name] = !open; drawSide() } },
                ic("chevronRight", 13, "chev"), ic("table", 13), h("span", { class: "ellipsis", text: t.name }), h("span", { class: "sp" }), h("small", { text: fmtNum(t.rowCount || 0) })),
              h("button", { type: "button", class: "icon-btn sm", title: "Insert " + t.name, "aria-label": "Insert table name " + t.name, style: "margin-right:6px", onclick: function () { ed.insert(quoteIdent(t.name)) } }, ic("insert"))),
            open ? (t.columns || []).map(function (c) {
              return h("button", { type: "button", class: "tree-c", title: "Insert " + c.name, onclick: function () { ed.insert(quoteIdent(c.name)) } },
                c.primary ? h("span", { class: "k pk", text: "PK" }) : fks[c.name] ? h("span", { class: "k fk", text: "FK" }) : null,
                h("span", { class: "ellipsis", text: c.name }), h("small", { text: c.type || "" }));
            }) : null);
        }) : emptyState({ cls: "sm", icon: "database", text: "No tables found." }));
      } else if (st.side === "history") {
        var hist = sqlHistory();
        mount(side, hist.length ? [h("div", { class: "row", style: "padding:8px 12px;border-bottom:1px solid var(--border)" }, h("span", { class: "muted", style: "font-size:12px", text: plural(hist.length, "query", "queries") }), h("span", { class: "sp" }),
          btn("Clear", { icon: "trash", cls: "btn-xs btn-ghost", onclick: function () { store.set("sql-history", []); drawSide() } }))].concat(hist.map(function (x) {
            return h("div", { class: "snip" },
              h("div", { class: "snip-top" }, h("span", { class: "dot", style: "color:var(" + (x.ok ? "--ok" : "--err") + ")" }),
                h("span", { class: "muted", style: "font-weight:500", text: x.ok ? plural(x.rows, "row") + " · " + x.ms + " ms" : "failed" }), h("span", { class: "sp" }),
                h("span", { class: "acts" }, iconBtn("insert", "Load into editor", function () { ed.set(x.sql) }, "sm"), iconBtn("play", "Run again", function () { ed.set(x.sql); run(x.sql) }, "sm")),
                h("time", { text: ago(x.t) })),
              h("code", { text: x.sql.replace(/\s+/g, " "), title: x.sql }));
          })) : emptyState({ cls: "sm", icon: "history", title: "No history", text: "The last 50 queries you run are kept in this browser." }));
      } else {
        var snips = store.get("sql-snippets", []);
        mount(side, h("div", { style: "padding:10px 12px;border-bottom:1px solid var(--border)" }, btn("Save current query", { icon: "save", cls: "btn-sm", onclick: saveSnippet })),
          snips.length ? snips.map(function (x) {
            return h("div", { class: "snip" },
              h("div", { class: "snip-top" }, ic("bookmark", 13, "muted"), h("span", { class: "ellipsis", text: x.name }), h("span", { class: "sp" }),
                h("span", { class: "acts" }, iconBtn("insert", "Load into editor", function () { ed.set(x.sql) }, "sm"), iconBtn("play", "Run", function () { ed.set(x.sql); run(x.sql) }, "sm"),
                  iconBtn("trash", "Delete snippet", function () { store.set("sql-snippets", store.get("sql-snippets", []).filter(function (y) { return y.id !== x.id })); drawSide(); toast("Snippet deleted", "info") }, "sm"))),
              h("code", { text: x.sql.replace(/\s+/g, " "), title: x.sql }));
          }) : emptyState({ cls: "sm", icon: "bookmark", title: "No saved snippets", text: "Save queries you reuse often. They stay in this browser." }));
      }
    }
    function saveSnippet() {
      var sql = ed.ta.value.trim();
      if (!sql) { toast("The editor is empty", "warn"); return }
      var first = sql.split("\n")[0].replace(/^--\s*/, "").slice(0, 48);
      var name = h("input", { class: "input", value: first, "aria-label": "Snippet name", style: "width:100%" });
      var doSave = function () {
        var n = name.value.trim() || "Untitled query";
        var snips = store.get("sql-snippets", []);
        snips.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: n, sql: sql, t: Date.now() });
        store.set("sql-snippets", snips.slice(0, 100));
        m.close(); st.side = "saved"; store.set("sql-side", "saved"); drawSide(); toast("Snippet saved", "success");
      };
      name.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSave() } });
      var pre = h("pre", { class: "code", style: "margin-top:12px;border:1px solid var(--border);border-radius:var(--r-sm);max-height:180px;background:var(--surface-2)" }, sqlNode(sql));
      var m = openModal("Save snippet", h("div", { class: "modal-b" }, h("label", { class: "sect-h", text: "Name" }), name, pre),
        [btn("Cancel", { cls: "btn-sm btn-ghost", onclick: function () { m.close() } }), btn("Save snippet", { icon: "save", cls: "btn-sm btn-primary", onclick: doSave })], { width: 520 });
      name.focus(); name.select();
    }

    add(seg, [["schema", "Schema"], ["history", "History"], ["saved", "Saved"]].map(function (x) {
      return h("button", { type: "button", "data-k": x[0], style: "flex:1", onclick: function () { st.side = x[0]; store.set("sql-side", x[0]); drawSide() }, text: x[1] });
    }));
    var pane = h("div", { class: "pane pane-l narrow" }, h("div", { class: "pane-h" }, seg), side);
    var main = h("div", { class: "sql-main" },
      h("div", { class: "sql-editor-wrap" },
        h("div", { class: "sql-bar" },
          btn("Run", { icon: "play", cls: "btn-sm btn-primary", kbd: "Ctrl ↵", title: "Run (Ctrl+Enter). Runs the selection if text is selected.", onclick: function () { var s = ed.ta.value.slice(ed.ta.selectionStart, ed.ta.selectionEnd); run(s.trim() ? s : ed.ta.value) } }),
          btn("Save", { icon: "save", cls: "btn-sm btn-ghost", onclick: saveSnippet }),
          btn("Clear", { icon: "eraser", cls: "btn-sm btn-ghost", onclick: function () { ed.set("") } }),
          h("span", { class: "sp" }),
          h("span", { class: "notice", title: "Only SELECT, WITH, PRAGMA, EXPLAIN, SHOW and DESCRIBE statements are accepted" }, ic("lock"), "Read-only"),
          S.data.dbDriver ? badge(S.data.dbDriver, "accent", "database") : null),
        ed.el),
      h("div", { class: "sql-res" }, resHead, resBody));
    mount(el, pane, main);
    drawSide(); drawResult();
    if (st.autorun || route.query.run != null) { st.autorun = false; if (route.query.run != null) replaceHash("#/sql"); run(st.text) }
    else requestAnimationFrame(function () { ed.ta.focus() });
  }
});
`
