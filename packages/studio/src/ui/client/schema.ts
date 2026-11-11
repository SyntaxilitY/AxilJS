/**
 * Client runtime — Schema / ER diagram: layered layout, inline SVG, pan + zoom.
 */
export const SCHEMA = String.raw`
var ER_W = 236, ER_HEAD = 38, ER_ROW = 22, ER_MAXCOLS = 14, ER_GAPX = 112, ER_GAPY = 28, ER_PAD = 48;

function erLayout(tables) {
  var byName = {}; tables.forEach(function (t) { byName[t.name] = t });
  var layer = {}, visiting = {};
  function depth(n) {
    if (layer[n] != null) return layer[n];
    if (visiting[n]) return 0;
    visiting[n] = 1;
    var d = 0;
    (byName[n].foreignKeys || []).forEach(function (fk) { if (fk.refTable !== n && byName[fk.refTable]) d = Math.max(d, depth(fk.refTable) + 1) });
    visiting[n] = 0; layer[n] = d; return d;
  }
  tables.forEach(function (t) { depth(t.name) });
  var layers = [];
  tables.forEach(function (t) { var l = layer[t.name]; (layers[l] = layers[l] || []).push(t) });
  layers = layers.filter(Boolean);
  var incoming = {};
  tables.forEach(function (t) { (t.foreignKeys || []).forEach(function (fk) { incoming[fk.refTable] = (incoming[fk.refTable] || 0) + 1 }) });
  var pos = {};
  layers.forEach(function (ls, li) {
    if (li === 0) ls.sort(function (a, b) { return (incoming[b.name] || 0) - (incoming[a.name] || 0) || a.name.localeCompare(b.name) });
    else ls.sort(function (a, b) { return bary(a) - bary(b) || a.name.localeCompare(b.name) });
    ls.forEach(function (t, i) { pos[t.name] = i });
  });
  function bary(t) {
    var refs = (t.foreignKeys || []).map(function (fk) { return pos[fk.refTable] }).filter(function (x) { return x != null });
    return refs.length ? refs.reduce(function (a, b) { return a + b }, 0) / refs.length : 999;
  }
  var nodes = {}, heights = [];
  layers.forEach(function (ls, li) {
    var y = 0;
    ls.forEach(function (t) {
      var n = Math.min((t.columns || []).length, ER_MAXCOLS) + ((t.columns || []).length > ER_MAXCOLS ? 1 : 0);
      var hgt = ER_HEAD + Math.max(1, n) * ER_ROW + 8;
      nodes[t.name] = { t: t, x: ER_PAD + li * (ER_W + ER_GAPX), y: y, w: ER_W, h: hgt };
      y += hgt + ER_GAPY;
    });
    heights[li] = y - ER_GAPY;
  });
  var maxH = Math.max.apply(null, heights.concat([0]));
  layers.forEach(function (ls, li) { var off = ER_PAD + (maxH - heights[li]) / 2; ls.forEach(function (t) { nodes[t.name].y += off }) });
  return { nodes: nodes, width: ER_PAD * 2 + layers.length * ER_W + Math.max(0, layers.length - 1) * ER_GAPX, height: maxH + ER_PAD * 2 };
}
function erRowY(node, col) {
  var cols = node.t.columns || [];
  var i = -1; cols.forEach(function (c, j) { if (c.name === col && i < 0) i = j });
  if (i < 0 || i >= ER_MAXCOLS) return node.y + ER_HEAD / 2;
  return node.y + ER_HEAD + i * ER_ROW + ER_ROW / 2 + 2;
}

defineView("schema", {
  title: "Schema", icon: "schema", key: "s", full: true,
  render: function (el) {
    if (!S.data) { mount(el, h("div", { class: "workspace" }, h("div", { style: "padding:20px" }, skelLines(8)))); return }
    var tables = allTables();
    if (!tables.length) { mount(el, h("div", { class: "workspace" }, noDatabase())); return }
    var L = erLayout(tables);
    var edges = [];
    tables.forEach(function (t) { (t.foreignKeys || []).forEach(function (fk) { if (L.nodes[fk.refTable]) edges.push({ from: t.name, col: fk.column, to: fk.refTable, refCol: fk.refColumn }) }) });

    var world = h("svg:g");
    var svg = h("svg:svg", { role: "img", "aria-label": "Entity relationship diagram of " + plural(tables.length, "table") }, world);
    var edgeLayer = h("svg:g"), nodeLayer = h("svg:g");
    world.appendChild(edgeLayer); world.appendChild(nodeLayer);

    var edgeEls = edges.map(function (e) {
      var a = L.nodes[e.from], b = L.nodes[e.to];
      var y1 = erRowY(a, e.col), y2 = erRowY(b, e.refCol), d, x1, x2;
      if (e.from === e.to) {
        x1 = a.x + a.w; x2 = x1;
        d = "M" + x1 + "," + y1 + " C" + (x1 + 50) + "," + y1 + " " + (x1 + 50) + "," + y2 + " " + x2 + "," + y2;
      } else if (a.x > b.x) {
        x1 = a.x; x2 = b.x + b.w; var mx = (x1 - x2) / 2;
        d = "M" + x1 + "," + y1 + " C" + (x1 - mx) + "," + y1 + " " + (x2 + mx) + "," + y2 + " " + x2 + "," + y2;
      } else {
        x1 = a.x + a.w; x2 = b.x + (a.x === b.x ? b.w : 0);
        var bend = a.x === b.x ? 60 : Math.max(40, (x2 - x1) / 2);
        d = "M" + x1 + "," + y1 + " C" + (x1 + bend) + "," + y1 + " " + (x2 + (a.x === b.x ? bend : -bend)) + "," + y2 + " " + x2 + "," + y2;
      }
      var g = h("svg:g", null,
        h("svg:path", { class: "er-edge", d: d }),
        h("svg:circle", { class: "er-dot", cx: x1, cy: y1, r: 3 }),
        h("svg:circle", { class: "er-dot", cx: x2, cy: y2, r: 3.5 }),
        h("svg:title", { text: e.from + "." + e.col + " → " + e.to + "." + e.refCol }));
      edgeLayer.appendChild(g);
      return { e: e, g: g };
    });

    Object.keys(L.nodes).forEach(function (name) {
      var n = L.nodes[name], t = n.t, fks = {};
      (t.foreignKeys || []).forEach(function (fk) { fks[fk.column] = fk });
      var g = h("svg:g", { class: "er-node", transform: "translate(" + n.x + "," + n.y + ")", tabindex: "0", role: "link", "aria-label": "Open table " + name, "data-name": name });
      add(g, h("svg:rect", { class: "bg", width: n.w, height: n.h, rx: 10 }),
        h("svg:path", { class: "hd", d: "M0.5,10 a9.5,9.5 0 0 1 9.5,-9.5 h" + (n.w - 20) + " a9.5,9.5 0 0 1 9.5,9.5 v" + (ER_HEAD - 10.5) + " h-" + (n.w - 1) + "z" }),
        h("svg:line", { class: "sep", x1: 0, y1: ER_HEAD, x2: n.w, y2: ER_HEAD }),
        h("svg:text", { class: "ttl", x: 14, y: 24, text: name.length > 22 ? name.slice(0, 21) + "…" : name }),
        h("svg:text", { class: "cnt", x: n.w - 14, y: 24, "text-anchor": "end", text: fmtNum(t.rowCount || 0) + " rows" }));
      var cols = t.columns || [];
      cols.slice(0, ER_MAXCOLS).forEach(function (c, i) {
        var y = ER_HEAD + i * ER_ROW + ER_ROW / 2 + 6;
        if (c.primary) add(g, h("svg:text", { class: "pk", x: 14, y: y, text: "PK" }));
        else if (fks[c.name]) add(g, h("svg:text", { class: "fk", x: 14, y: y, text: "FK" }));
        add(g, h("svg:text", { class: "col", x: 36, y: y, text: c.name.length > 20 ? c.name.slice(0, 19) + "…" : c.name }),
          h("svg:text", { class: "typ", x: n.w - 14, y: y, "text-anchor": "end", text: String(c.type || "").toLowerCase().slice(0, 12) }));
      });
      if (cols.length > ER_MAXCOLS) add(g, h("svg:text", { class: "typ", x: 36, y: ER_HEAD + ER_MAXCOLS * ER_ROW + ER_ROW / 2 + 6, text: "+" + (cols.length - ER_MAXCOLS) + " more columns" }));
      if (!cols.length) add(g, h("svg:text", { class: "typ", x: 14, y: ER_HEAD + ER_ROW / 2 + 6, text: "no columns" }));
      g.addEventListener("mouseenter", function () { focusNode(name) });
      g.addEventListener("mouseleave", function () { focusNode(null) });
      g.addEventListener("focus", function () { focusNode(name) });
      g.addEventListener("blur", function () { focusNode(null) });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter") go(dbHash(name)) });
      nodeLayer.appendChild(g);
    });
    function focusNode(name) {
      var linked = {};
      if (name) { linked[name] = 1; edges.forEach(function (e) { if (e.from === name || e.to === name) { linked[e.from] = 1; linked[e.to] = 1 } }) }
      $$(".er-node", nodeLayer).forEach(function (g) { g.classList.toggle("dim", !!name && !linked[g.getAttribute("data-name")]) });
      edgeEls.forEach(function (x) {
        var on = !!name && (x.e.from === name || x.e.to === name);
        $$("path,circle", x.g).forEach(function (p) { p.classList.toggle("hl", on) });
        if (on) edgeLayer.appendChild(x.g);
      });
    }

    var canvas = h("div", { class: "er" }, svg);
    var zoomLbl = h("div", { class: "er-zoom", "aria-live": "polite" });
    var V = S.er && S.er.key === tables.map(function (t) { return t.name }).join(",") ? S.er.v : null;
    var view = V ? { x: V.x, y: V.y, k: V.k } : { x: 0, y: 0, k: 1 };
    function apply() {
      world.setAttribute("transform", "translate(" + view.x + "," + view.y + ") scale(" + view.k + ")");
      zoomLbl.textContent = Math.round(view.k * 100) + "%";
      S.er = { key: tables.map(function (t) { return t.name }).join(","), v: { x: view.x, y: view.y, k: view.k }, redraw: null };
    }
    function zoomAt(f, cx, cy) {
      var k = Math.max(0.2, Math.min(2.5, view.k * f));
      view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k; apply();
    }
    function fit() {
      var r = canvas.getBoundingClientRect(); if (!r.width) return;
      var k = Math.max(0.2, Math.min(1.15, Math.min(r.width / L.width, (r.height - 40) / L.height)));
      view.k = k; view.x = (r.width - L.width * k) / 2; view.y = Math.max(0, (r.height - L.height * k) / 2 - 10); apply();
    }
    var center = function () { var r = canvas.getBoundingClientRect(); return [r.width / 2, r.height / 2] };
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
      else { view.x -= e.deltaX; apply() }
    }, { passive: false });
    var drag = null;
    canvas.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var node = e.target.closest ? e.target.closest(".er-node") : null;
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, node: node ? node.getAttribute("data-name") : null, id: e.pointerId };
      try { canvas.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; canvas.classList.add("dragging") }
      if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; apply() }
    });
    var end = function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var d = drag; drag = null; canvas.classList.remove("dragging");
      if (!d.moved && d.node && e.type === "pointerup") go(dbHash(d.node));
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    var ctrl = h("div", { class: "er-ctrl" },
      h("button", { type: "button", title: "Zoom in", "aria-label": "Zoom in", onclick: function () { var c = center(); zoomAt(1.2, c[0], c[1]) } }, ic("plus")),
      h("button", { type: "button", title: "Zoom out", "aria-label": "Zoom out", onclick: function () { var c = center(); zoomAt(1 / 1.2, c[0], c[1]) } }, ic("zoomOut")),
      h("button", { type: "button", title: "Fit to screen", "aria-label": "Fit to screen", onclick: fit }, ic("fit")));
    add(canvas, ctrl, zoomLbl,
      h("div", { class: "er-legend" }, h("span", null, h("b", { style: "color:var(--warn);font-size:10px", text: "PK" }), "primary key"), h("span", null, h("b", { style: "color:var(--info);font-size:10px", text: "FK" }), "foreign key"), h("span", { class: "muted", text: "Drag to pan · scroll to zoom · click to open" })));

    var findInput = h("input", { class: "input sm", type: "search", placeholder: "Find table…", "aria-label": "Find table", spellcheck: "false" });
    findInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var q = findInput.value.trim().toLowerCase(); if (!q) return;
      var hit = Object.keys(L.nodes).filter(function (n) { return n.toLowerCase().indexOf(q) >= 0 })[0];
      if (!hit) { toast("No table matches “" + findInput.value + "”", "warn"); return }
      var n = L.nodes[hit], r = canvas.getBoundingClientRect();
      view.k = Math.max(view.k, 0.9); view.x = r.width / 2 - (n.x + n.w / 2) * view.k; view.y = r.height / 2 - (n.y + n.h / 2) * view.k; apply();
      focusNode(hit); setTimeout(function () { focusNode(null) }, 1600);
    });
    var bar = h("div", { class: "toolbar" },
      h("div", { class: "h2" }, ic("schema", 15, "muted"), plural(tables.length, "table"), h("span", { class: "faint", text: "·" }), h("span", { class: "muted", style: "font-weight:500", text: plural(edges.length, "relation") })),
      S.schemaState !== "ok" ? badge("relations unavailable", "warn", "alert") : null,
      h("span", { class: "sp" }), h("div", { class: "search", style: "width:220px" }, ic("search"), findInput),
      btn("Fit", { icon: "fit", cls: "btn-sm", onclick: fit }));
    mount(el, h("div", { class: "workspace" }, bar, canvas));
    if (V) apply(); else requestAnimationFrame(fit);
    var onResize = debounce(function () { if (!V) fit() }, 150);
    window.addEventListener("resize", onResize);
    S.cleanup.push(function () { window.removeEventListener("resize", onResize) });
  }
});
`
