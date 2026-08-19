"use strict";
/**
 * Axil ORM Studio — Single-file HTML UI
 * No build step, no framework, pure HTML/CSS/JS.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHTML = generateHTML;
function generateHTML(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.appName} — Axil ORM Studio</title>
<style>
  :root {
    --bg:       #0f1117;
    --surface:  #1a1d27;
    --border:   #2a2d3d;
    --accent:   #00d4ff;
    --accent2:  #7c3aed;
    --green:    #10b981;
    --red:      #ef4444;
    --yellow:   #f59e0b;
    --text:     #e2e8f0;
    --muted:    #64748b;
    --radius:   8px;
    --font:     'Inter', system-ui, -apple-system, sans-serif;
    --mono:     'JetBrains Mono', 'Fira Code', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background:  var(--bg);
    color:       var(--text);
    font-family: var(--font);
    font-size:   14px;
    line-height: 1.6;
    display:     flex;
    height:      100vh;
    overflow:    hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width:      220px;
    min-width:  220px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display:    flex;
    flex-direction: column;
    padding:    16px 0;
  }

  .logo {
    padding:     0 20px 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
  }

  .logo-title {
    font-size:   18px;
    font-weight: 700;
    color:       var(--accent);
    letter-spacing: -0.5px;
  }

  .logo-sub {
    font-size:  11px;
    color:      var(--muted);
    margin-top: 2px;
  }

  .nav-item {
    display:     flex;
    align-items: center;
    gap:         10px;
    padding:     10px 20px;
    cursor:      pointer;
    border-radius: 0;
    transition:  background 0.15s;
    color:       var(--muted);
    font-size:   13px;
    font-weight: 500;
    border:      none;
    background:  none;
    width:       100%;
    text-align:  left;
  }

  .nav-item:hover    { background: rgba(255,255,255,0.05); color: var(--text); }
  .nav-item.active   { background: rgba(0, 212, 255, 0.1); color: var(--accent); }
  .nav-item .icon    { font-size: 16px; width: 20px; text-align: center; }
  .nav-badge {
    margin-left: auto;
    background:  var(--accent2);
    color:       white;
    font-size:   10px;
    padding:     1px 6px;
    border-radius: 10px;
    font-weight: 600;
  }

  .sidebar-footer {
    margin-top: auto;
    padding:    16px 20px;
    border-top: 1px solid var(--border);
  }

  .status-dot {
    display:     inline-block;
    width:       8px;
    height:      8px;
    border-radius: 50%;
    background:  var(--green);
    margin-right: 6px;
    animation:   pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  /* ── Main ── */
  .main {
    flex:     1;
    display:  flex;
    flex-direction: column;
    overflow: hidden;
  }

  .topbar {
    height:      56px;
    background:  var(--surface);
    border-bottom: 1px solid var(--border);
    display:     flex;
    align-items: center;
    padding:     0 24px;
    gap:         16px;
    flex-shrink: 0;
  }

  .topbar-title {
    font-size:   15px;
    font-weight: 600;
    color:       var(--text);
  }

  .topbar-url {
    font-family: var(--mono);
    font-size:   12px;
    color:       var(--accent);
    background:  rgba(0, 212, 255, 0.1);
    padding:     4px 10px;
    border-radius: var(--radius);
    text-decoration: none;
    cursor:      pointer;
  }

  .topbar-actions {
    margin-left: auto;
    display:     flex;
    gap:         8px;
  }

  .btn {
    padding:       6px 14px;
    border-radius: var(--radius);
    border:        none;
    cursor:        pointer;
    font-size:     12px;
    font-weight:   600;
    transition:    all 0.15s;
  }

  .btn-primary {
    background: var(--accent);
    color:      #000;
  }

  .btn-primary:hover { background: #00bbdd; }

  .btn-ghost {
    background: transparent;
    border:     1px solid var(--border);
    color:      var(--text);
  }

  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

  /* ── Content ── */
  .content {
    flex:       1;
    overflow-y: auto;
    padding:    24px;
  }

  .tab { display: none; }
  .tab.active { display: block; }

  /* ── Cards ── */
  .card {
    background:    var(--surface);
    border:        1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 16px;
  }

  .card-header {
    padding:       14px 16px;
    border-bottom: 1px solid var(--border);
    display:       flex;
    align-items:   center;
    gap:           10px;
  }

  .card-title {
    font-size:   13px;
    font-weight: 600;
    color:       var(--text);
  }

  .card-body { padding: 16px; }

  /* ── Overview grid ── */
  .overview-grid {
    display:               grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap:                   16px;
    margin-bottom:         24px;
  }

  .stat-card {
    background:    var(--surface);
    border:        1px solid var(--border);
    border-radius: var(--radius);
    padding:       16px;
  }

  .stat-value {
    font-size:   28px;
    font-weight: 700;
    color:       var(--accent);
    line-height: 1;
  }

  .stat-label {
    font-size:  12px;
    color:      var(--muted);
    margin-top: 6px;
  }

  /* ── Route list ── */
  .route-item {
    display:       flex;
    align-items:   center;
    gap:           12px;
    padding:       10px 0;
    border-bottom: 1px solid var(--border);
    cursor:        pointer;
  }

  .route-item:last-child { border-bottom: none; }
  .route-item:hover .route-path { color: var(--accent); }

  .method-badge {
    font-family:   var(--mono);
    font-size:     10px;
    font-weight:   700;
    padding:       3px 7px;
    border-radius: 4px;
    min-width:     50px;
    text-align:    center;
  }

  .method-GET    { background: rgba(16, 185, 129, 0.2);  color: #10b981; }
  .method-POST   { background: rgba(124, 58, 237, 0.2);  color: #7c3aed; }
  .method-PUT    { background: rgba(245, 158, 11, 0.2);  color: #f59e0b; }
  .method-PATCH  { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  .method-DELETE { background: rgba(239, 68, 68, 0.2);   color: #ef4444; }

  .route-path {
    font-family: var(--mono);
    font-size:   13px;
    color:       var(--text);
    transition:  color 0.15s;
  }

  .route-handler {
    margin-left: auto;
    font-size:   11px;
    color:       var(--muted);
  }

  .middleware-tag {
    font-size:     10px;
    padding:       2px 6px;
    border-radius: 4px;
    background:    rgba(124, 58, 237, 0.2);
    color:         #7c3aed;
  }

  /* ── Database table ── */
  .db-table-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap:     12px;
    margin-bottom: 16px;
  }

  .db-table-card {
    background:    var(--bg);
    border:        1px solid var(--border);
    border-radius: var(--radius);
    padding:       14px;
    cursor:        pointer;
    transition:    border-color 0.15s;
  }

  .db-table-card:hover    { border-color: var(--accent); }
  .db-table-card.selected { border-color: var(--accent); background: rgba(0,212,255,0.05); }

  .db-table-name {
    font-family: var(--mono);
    font-size:   13px;
    font-weight: 600;
    color:       var(--text);
  }

  .db-table-count {
    font-size:  11px;
    color:      var(--muted);
    margin-top: 4px;
  }

  /* ── Data grid ── */
  .data-grid-wrap { overflow-x: auto; }

  table {
    width:           100%;
    border-collapse: collapse;
    font-size:       12px;
  }

  th {
    background:    var(--bg);
    padding:       8px 12px;
    text-align:    left;
    font-family:   var(--mono);
    font-size:     11px;
    font-weight:   600;
    color:         var(--muted);
    border-bottom: 1px solid var(--border);
    white-space:   nowrap;
  }

  td {
    padding:       8px 12px;
    border-bottom: 1px solid rgba(42, 45, 61, 0.5);
    font-family:   var(--mono);
    font-size:     12px;
    max-width:     300px;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  tr:hover td { background: rgba(255,255,255,0.02); }

  .null-val  { color: var(--muted); font-style: italic; }
  .bool-true  { color: var(--green); }
  .bool-false { color: var(--red); }

  /* ── QR section ── */
  .qr-container {
    display:         flex;
    flex-direction:  column;
    align-items:     center;
    gap:             16px;
    padding:         32px;
  }

  .qr-image {
    border:        8px solid white;
    border-radius: 12px;
    width:         200px;
    height:        200px;
  }

  .qr-label {
    font-size:  13px;
    color:      var(--muted);
    text-align: center;
  }

  /* ── WebSocket panel ── */
  .ws-event-log {
    background:    var(--bg);
    border:        1px solid var(--border);
    border-radius: var(--radius);
    height:        300px;
    overflow-y:    auto;
    padding:       12px;
    font-family:   var(--mono);
    font-size:     12px;
  }

  .ws-event {
    padding:     4px 0;
    border-bottom: 1px solid rgba(42,45,61,0.3);
    color:       var(--text);
  }

  .ws-event-time { color: var(--muted); margin-right: 8px; }

  /* ── Search ── */
  .search-bar {
    background:    var(--bg);
    border:        1px solid var(--border);
    border-radius: var(--radius);
    padding:       8px 12px;
    color:         var(--text);
    font-size:     13px;
    width:         100%;
    margin-bottom: 16px;
    outline:       none;
    transition:    border-color 0.15s;
  }

  .search-bar:focus { border-color: var(--accent); }

  /* ── Pagination ── */
  .pagination {
    display:     flex;
    align-items: center;
    gap:         8px;
    padding-top: 12px;
    justify-content: flex-end;
  }

  .page-info { font-size: 12px; color: var(--muted); }

  /* ── Empty state ── */
  .empty {
    text-align:  center;
    padding:     48px;
    color:       var(--muted);
    font-size:   13px;
  }

  .empty-icon { font-size: 32px; margin-bottom: 12px; }

  /* ── Toast ── */
  .toast {
    position:      fixed;
    bottom:        24px;
    right:         24px;
    background:    var(--surface);
    border:        1px solid var(--border);
    border-radius: var(--radius);
    padding:       12px 16px;
    font-size:     13px;
    opacity:       0;
    transition:    opacity 0.3s;
    z-index:       1000;
  }

  .toast.show { opacity: 1; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar       { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
</style>
</head>
<body>

<!-- Sidebar -->
<nav class="sidebar">
  <div class="logo">
    <div class="logo-title">⚡ Axil ORM Studio</div>
    <div class="logo-sub">${data.appName}</div>
  </div>

  <button class="nav-item active" onclick="showTab('overview')" id="nav-overview">
    <span class="icon">🏠</span> Overview
  </button>
  <button class="nav-item" onclick="showTab('routes')" id="nav-routes">
    <span class="icon">🔀</span> Routes
    <span class="nav-badge" id="badge-routes">0</span>
  </button>
  <button class="nav-item" onclick="showTab('database')" id="nav-database">
    <span class="icon">🗄️</span> Database
    <span class="nav-badge" id="badge-tables">0</span>
  </button>
  <button class="nav-item" onclick="showTab('websockets')" id="nav-websockets">
    <span class="icon">🔌</span> WebSockets
  </button>
  <button class="nav-item" onclick="showTab('collections')" id="nav-collections">
    <span class="icon">📦</span> Collections
  </button>
  <button class="nav-item" onclick="showTab('qr')" id="nav-qr">
    <span class="icon">📱</span> QR Code
  </button>

  <div class="sidebar-footer">
    <div style="font-size:11px; color:var(--muted)">
      <span class="status-dot"></span>Running
    </div>
    <div style="font-size:11px; color:var(--muted); margin-top:4px;">
      App: <a href="${data.appUrl}" target="_blank" style="color:var(--accent)">${data.appUrl}</a>
    </div>
  </div>
</nav>

<!-- Main -->
<div class="main">
  <div class="topbar">
    <span class="topbar-title" id="tab-label">Overview</span>
    <a class="topbar-url" href="${data.appUrl}" target="_blank">${data.appUrl}</a>
    <div class="topbar-actions">
      <button class="btn btn-ghost" onclick="refreshData()">↺ Refresh</button>
      <button class="btn btn-primary" onclick="showTab('collections')">Export</button>
    </div>
  </div>

  <div class="content">

    <!-- OVERVIEW -->
    <div class="tab active" id="tab-overview">
      <div class="overview-grid" id="overview-stats"></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔀 Recent Routes</span>
        </div>
        <div class="card-body" id="overview-routes-list"></div>
      </div>
    </div>

    <!-- ROUTES -->
    <div class="tab" id="tab-routes">
      <input class="search-bar" type="text"
        placeholder="Search routes by method, path, or handler..."
        oninput="filterRoutes(this.value)" />
      <div class="card">
        <div class="card-header">
          <span class="card-title">API Routes</span>
        </div>
        <div class="card-body" id="routes-list"></div>
      </div>
    </div>

    <!-- DATABASE -->
    <div class="tab" id="tab-database">
      <div class="db-table-list" id="table-list"></div>
      <div class="card" id="table-data-card" style="display:none">
        <div class="card-header">
          <span class="card-title" id="table-data-title">Table Data</span>
          <span style="margin-left:auto;font-size:11px;color:var(--muted)" id="table-row-count"></span>
        </div>
        <div class="card-body">
          <div class="data-grid-wrap" id="table-data-grid"></div>
          <div class="pagination" id="table-pagination"></div>
        </div>
      </div>
    </div>

    <!-- WEBSOCKETS -->
    <div class="tab" id="tab-websockets">
      <div id="ws-list"></div>
    </div>

    <!-- COLLECTIONS -->
    <div class="tab" id="tab-collections">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="card">
          <div class="card-header">
            <span class="card-title">📮 Postman Collection</span>
          </div>
          <div class="card-body">
            <p style="color:var(--muted);font-size:13px;margin-bottom:16px">
              Import into Postman to test all your API routes instantly.
            </p>
            <button class="btn btn-primary" onclick="downloadPostman()">
              ⬇ Download Collection
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">🌙 Insomnia Collection</span>
          </div>
          <div class="card-body">
            <p style="color:var(--muted);font-size:13px;margin-bottom:16px">
              Import into Insomnia REST Client to test your API endpoints.
            </p>
            <button class="btn btn-primary" onclick="downloadInsomnia()">
              ⬇ Download Collection
            </button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:0">
        <div class="card-header">
          <span class="card-title">📋 OpenAPI / Swagger</span>
        </div>
        <div class="card-body">
          <p style="color:var(--muted);font-size:13px;margin-bottom:16px">
            Download OpenAPI 3.0 spec to generate client SDKs or use with Swagger UI.
          </p>
          <button class="btn btn-ghost" onclick="downloadOpenAPI()">
            ⬇ Download openapi.json
          </button>
        </div>
      </div>
    </div>

    <!-- QR -->
    <div class="tab" id="tab-qr">
      <div class="card">
        <div class="card-header">
          <span class="card-title">📱 QR Code — Mobile Access</span>
        </div>
        <div class="card-body qr-container">
          <img class="qr-image" src="${data.qrDataUrl}" alt="QR Code" />
          <div class="qr-label">
            Scan with your phone to open<br>
            <strong style="color:var(--accent)">${data.appUrl}</strong><br>
            on any device on the same network.
          </div>
          <button class="btn btn-ghost" onclick="copyUrl('${data.appUrl}')">
            Copy URL
          </button>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">📱 Studio QR Code</span>
        </div>
        <div class="card-body qr-container" id="studio-qr-container">
          <div class="qr-label">Loading studio QR...</div>
        </div>
      </div>
    </div>

  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
// ── State ──────────────────────────────────────────────────────────────────
let _data      = null
let _tableRows = {}
let _tablePage = {}
const PAGE_SIZE = 50

// ── Fetch data from Studio API ──────────────────────────────────────────────
async function refreshData() {
  try {
    const res = await fetch('/api/studio/data')
    _data     = await res.json()
    renderAll()
    showToast('Data refreshed')
  } catch (e) {
    showToast('Failed to refresh: ' + e.message)
  }
}

function renderAll() {
  if (!_data) return
  renderOverview()
  renderRoutes()
  renderTables()
  renderWebSockets()
  updateBadges()
}

// ── Overview ────────────────────────────────────────────────────────────────
function renderOverview() {
  const d = _data
  document.getElementById('overview-stats').innerHTML = [
    stat(d.routes.length,     'API Routes'),
    stat(d.tables.length,     'DB Tables'),
    stat(d.websockets.length, 'WebSocket Paths'),
    stat(d.sse.length,        'SSE Streams')
  ].join('')

  const recent = d.routes.slice(0, 8)
  document.getElementById('overview-routes-list').innerHTML =
    recent.length
      ? recent.map(routeRow).join('')
      : '<div class="empty"><div class="empty-icon">🔀</div>No routes found</div>'
}

function stat(value, label) {
  return \`<div class="stat-card">
    <div class="stat-value">\${value}</div>
    <div class="stat-label">\${label}</div>
  </div>\`
}

// ── Routes ──────────────────────────────────────────────────────────────────
let _routeFilter = ''

function renderRoutes() {
  const filtered = (_data?.routes ?? []).filter(r => {
    const q = _routeFilter.toLowerCase()
    return (
      r.method.toLowerCase().includes(q) ||
      r.path.toLowerCase().includes(q) ||
      r.handler.toLowerCase().includes(q)
    )
  })

  document.getElementById('routes-list').innerHTML =
    filtered.length
      ? filtered.map(routeRow).join('')
      : '<div class="empty"><div class="empty-icon">🔍</div>No routes match your search</div>'
}

function filterRoutes(q) {
  _routeFilter = q
  renderRoutes()
}

function routeRow(r) {
  const mw = (r.middleware ?? []).map(m =>
    \`<span class="middleware-tag">\${m}</span>\`
  ).join(' ')
  return \`<div class="route-item">
    <span class="method-badge method-\${r.method}">\${r.method}</span>
    <span class="route-path">\${r.path}</span>
    \${mw}
    <span class="route-handler">\${r.handler}</span>
  </div>\`
}

// ── Database ─────────────────────────────────────────────────────────────────
function renderTables() {
  const tables = _data?.tables ?? []
  const el     = document.getElementById('table-list')

  if (!tables.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🗄️</div>No database connected</div>'
    return
  }

  el.innerHTML = tables.map(t =>
    \`<div class="db-table-card" onclick="loadTable('\${t.name}')" id="tc-\${t.name}">
      <div class="db-table-name">\${t.name}</div>
      <div class="db-table-count">\${t.rowCount} rows · \${t.columns.length} cols</div>
    </div>\`
  ).join('')
}

async function loadTable(name) {
  // Highlight selected
  document.querySelectorAll('.db-table-card').forEach(c => c.classList.remove('selected'))
  const card = document.getElementById(\`tc-\${name}\`)
  if (card) card.classList.add('selected')

  _tablePage[name] = _tablePage[name] ?? 0

  try {
    const offset = _tablePage[name] * PAGE_SIZE
    const res    = await fetch(\`/api/studio/table/\${name}?limit=\${PAGE_SIZE}&offset=\${offset}\`)
    const data   = await res.json()
    _tableRows[name] = data

    const table = _data.tables.find(t => t.name === name)

    document.getElementById('table-data-card').style.display = 'block'
    document.getElementById('table-data-title').textContent = name
    document.getElementById('table-row-count').textContent =
      \`\${data.total} rows total\`

    renderDataGrid(name, data.rows, table?.columns ?? [])
    renderPagination(name, data.total)
  } catch (e) {
    showToast('Failed to load table: ' + e.message)
  }
}

function renderDataGrid(tableName, rows, columns) {
  if (!rows.length) {
    document.getElementById('table-data-grid').innerHTML =
      '<div class="empty"><div class="empty-icon">📭</div>Table is empty</div>'
    return
  }

  const headers = Object.keys(rows[0])
  const thead   = \`<tr>\${headers.map(h =>
    \`<th>\${h}</th>\`
  ).join('')}</tr>\`

  const tbody = rows.map(row =>
    \`<tr>\${headers.map(h => \`<td>\${formatCell(row[h])}</td>\`).join('')}</tr>\`
  ).join('')

  document.getElementById('table-data-grid').innerHTML =
    \`<table><thead>\${thead}</thead><tbody>\${tbody}</tbody></table>\`
}

function formatCell(val) {
  if (val === null || val === undefined) return '<span class="null-val">NULL</span>'
  if (val === true)  return '<span class="bool-true">true</span>'
  if (val === false) return '<span class="bool-false">false</span>'
  const s = String(val)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

function renderPagination(tableName, total) {
  const page      = _tablePage[tableName] ?? 0
  const lastPage  = Math.ceil(total / PAGE_SIZE) - 1
  const showing   = Math.min((page + 1) * PAGE_SIZE, total)

  document.getElementById('table-pagination').innerHTML = \`
    <span class="page-info">Showing \${page * PAGE_SIZE + 1}–\${showing} of \${total}</span>
    <button class="btn btn-ghost" \${page === 0 ? 'disabled' : ''}
      onclick="changePage('\${tableName}', \${page - 1})">← Prev</button>
    <button class="btn btn-ghost" \${page >= lastPage ? 'disabled' : ''}
      onclick="changePage('\${tableName}', \${page + 1})">Next →</button>
  \`
}

function changePage(tableName, page) {
  _tablePage[tableName] = page
  loadTable(tableName)
}

// ── WebSockets ───────────────────────────────────────────────────────────────
function renderWebSockets() {
  const ws  = _data?.websockets ?? []
  const sse = _data?.sse ?? []
  const el  = document.getElementById('ws-list')

  if (!ws.length && !sse.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔌</div>No WebSocket or SSE endpoints detected</div>'
    return
  }

  const wsCards = ws.map(w => \`
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <span style="color:var(--green)">●</span>
        <span class="card-title">WebSocket: \${w.path}</span>
      </div>
      <div class="card-body">
        <div style="margin-bottom:12px;font-size:12px;color:var(--muted)">
          Events: \${w.events.join(', ')}
        </div>
        <div class="ws-event-log" id="ws-log-\${w.path.replace(/\\//g,'-')}">
          <div class="ws-event">
            <span class="ws-event-time">--:--:--</span>
            Waiting for events...
          </div>
        </div>
      </div>
    </div>
  \`).join('')

  const sseCards = sse.map(s => \`
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <span style="color:var(--yellow)">▶</span>
        <span class="card-title">SSE Stream: \${s.path}</span>
      </div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--muted)">Events: \${s.events.join(', ')}</div>
      </div>
    </div>
  \`).join('')

  el.innerHTML = wsCards + sseCards
}

// ── Collections ───────────────────────────────────────────────────────────────
async function downloadPostman() {
  const res  = await fetch('/api/studio/export/postman')
  const data = await res.json()
  downloadJSON(data, 'Axil ORM-postman-collection.json')
  showToast('Postman collection downloaded')
}

async function downloadInsomnia() {
  const res  = await fetch('/api/studio/export/insomnia')
  const data = await res.json()
  downloadJSON(data, 'Axil ORM-insomnia-collection.json')
  showToast('Insomnia collection downloaded')
}

async function downloadOpenAPI() {
  const res  = await fetch('/api/studio/export/openapi')
  const data = await res.json()
  downloadJSON(data, 'openapi.json')
  showToast('OpenAPI spec downloaded')
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── Badges ────────────────────────────────────────────────────────────────────
function updateBadges() {
  const d = _data
  document.getElementById('badge-routes').textContent = d.routes.length
  document.getElementById('badge-tables').textContent = d.tables.length
}

// ── Navigation ────────────────────────────────────────────────────────────────
const TAB_LABELS = {
  overview:    'Overview',
  routes:      'API Routes',
  database:    'Database',
  websockets:  'WebSockets & SSE',
  collections: 'Export Collections',
  qr:          'QR Code'
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))

  document.getElementById('tab-' + name).classList.add('active')
  document.getElementById('nav-' + name).classList.add('active')
  document.getElementById('tab-label').textContent = TAB_LABELS[name] ?? name
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 3000)
}

function copyUrl(url) {
  navigator.clipboard.writeText(url).then(() => showToast('URL copied!'))
}

// ── Auto-refresh every 30s ────────────────────────────────────────────────────
setInterval(refreshData, 30000)

// ── Init ───────────────────────────────────────────────────────────────────────
refreshData()
</script>
</body>
</html>`;
}
//# sourceMappingURL=template.js.map