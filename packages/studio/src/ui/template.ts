/**
 * Axil ORM Studio — server-rendered shell.
 *
 * The page is one self-contained HTML document: inline CSS (styles.ts),
 * inline SVG icons (icons.ts) and an inline client runtime (client.ts) that
 * renders every view from Studio's own JSON API. No external fonts, CDNs or
 * images. Dynamic values reach the client only through a JSON boot block that
 * is escaped for safe embedding; the client builds DOM with textContent.
 */
import { buildStyles }        from './styles.js'
import { icon, iconPaths }    from './icons.js'
import { buildClientScript }  from './client.js'
import { LOGO_MARK_32, LOGO_MARK_64 } from './brand.js'

// Server-side escaping for values interpolated into the HTML markup
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** JSON that is safe inside a <script> element (no `</script>`, `<!--`, or line separators). */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATORS, c => (c.charCodeAt(0) === 0x2028 ? '\\u2028' : '\\u2029'))
}
const LINE_SEPARATORS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g')

/** Only http(s) URLs may become link targets. */
function safeHttpUrl(url: string): string {
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : '#'
}

/** Applies the theme + sidebar state before first paint (no flash). */
const THEME_BOOT = `(function(){var d=document.documentElement,t=null;try{var m=/[?&]theme=(light|dark)(?:&|$)/.exec(location.search);if(m)t=m[1];else t=JSON.parse(localStorage.getItem("axil-studio:theme")||"null")}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.setAttribute("data-theme",t);try{if(JSON.parse(localStorage.getItem("axil-studio:sb-collapsed")||"false"))d.classList.add("sb-collapsed")}catch(e){}})();`

interface NavItem { id: string; label: string; icon: string; count?: string }

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Workspace',
    items: [
      { id: 'overview',  label: 'Overview',    icon: 'overview' },
      { id: 'endpoints', label: 'Endpoints',   icon: 'endpoints', count: 'cnt-endpoints' },
      { id: 'database',  label: 'Database',    icon: 'database',  count: 'cnt-database' },
      { id: 'schema',    label: 'Schema',      icon: 'schema' },
      { id: 'sql',       label: 'SQL console', icon: 'sql' },
    ],
  },
  {
    section: 'Tools',
    items: [
      { id: 'realtime',  label: 'Realtime',    icon: 'realtime',  count: 'cnt-realtime' },
      { id: 'export',    label: 'Export',      icon: 'export' },
      { id: 'qr',        label: 'QR access',   icon: 'qr' },
    ],
  },
]

/** View ids rendered by the client router (exported for tests). */
export const STUDIO_VIEWS = NAV.flatMap(s => s.items.map(i => i.id))

export function generateHTML(data: {
  appName:    string
  appUrl:     string
  studioPort: number
  qrDataUrl:  string
}): string {
  // appName comes from package.json / config — never trust it as markup
  const appName   = escapeHtml(data.appName)
  const appUrl    = String(data.appUrl ?? '')
  const linkUrl   = escapeHtml(safeHttpUrl(appUrl))
  const shortUrl  = escapeHtml(appUrl.replace(/^https?:\/\//, ''))
  const studioUrl = `http://localhost:${Number(data.studioPort) || 0}`
  const qr        = /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(data.qrDataUrl ?? '') ? data.qrDataUrl : ''

  const boot = scriptJson({
    appName:   String(data.appName ?? ''),
    appUrl,
    studioUrl,
    qrDataUrl: qr,
    icons:     iconPaths(),
  })

  const nav = NAV.map(sec => `
      <div class="sb-sec">${sec.section}</div>${sec.items.map(it => `
      <a class="nav-item${it.id === 'overview' ? ' active' : ''}" href="#/${it.id}" data-view="${it.id}" title="${it.label}">${icon(it.icon)}<span class="nav-label">${it.label}</span>${it.count ? `<span class="nav-count" id="${it.count}"></span>` : ''}</a>`).join('')}`).join('')

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>${appName} · Axil Studio</title>
<link rel="icon" type="image/png" href="${LOGO_MARK_32}">
<script>${THEME_BOOT}</script>
${buildStyles()}
</head>
<body>
<div class="app">
  <aside class="sb" id="sidebar" aria-label="Studio navigation">
    <div class="sb-head">
      <span class="sb-logo"><img src="${LOGO_MARK_64}" width="30" height="30" alt="AxilJS"></span>
      <div class="sb-titles">
        <div class="sb-title">Axil Studio</div>
        <div class="sb-app" id="sb-app" title="${appName}">${appName}</div>
      </div>
      <button type="button" class="icon-btn sm sb-collapse" id="collapse-btn" title="Collapse sidebar ([)" aria-label="Collapse sidebar">${icon('sidebar')}</button>
    </div>
    <nav class="sb-nav">${nav}
    </nav>
    <div class="sb-foot">
      <button type="button" class="icon-btn sm sb-expand" id="expand-btn" title="Expand sidebar ([)" aria-label="Expand sidebar">${icon('sidebar')}</button>
      <div class="conn" id="conn" title="Connecting"><span class="conn-dot wait" id="conn-dot"></span><span class="conn-text" id="conn-text">Connecting…</span></div>
      <a class="conn-url" id="conn-url" href="${linkUrl}" target="_blank" rel="noopener noreferrer" title="Open the app">${icon('external')}<span>${shortUrl}</span></a>
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <button type="button" class="icon-btn tb-menu" id="menu-btn" aria-label="Open navigation">${icon('menu')}</button>
      <nav class="crumbs" id="crumbs" aria-label="Breadcrumb"><span class="cur">${appName}</span></nav>
      <button type="button" class="tb-search" id="palette-btn" aria-label="Search (Ctrl K)">${icon('search')}<span>Search…</span><span class="kbd">Ctrl K</span></button>
      <div class="tb-actions">
        <button type="button" class="icon-btn" id="theme-btn" title="Toggle theme" aria-label="Toggle theme">${icon('moon')}</button>
        <button type="button" class="icon-btn" id="refresh-btn" title="Refresh data" aria-label="Refresh data">${icon('refresh')}</button>
      </div>
    </header>
    <main class="content" id="content" tabindex="-1"></main>
  </div>
</div>
<div class="backdrop" id="backdrop"></div>
<div class="toasts" id="toasts" aria-live="polite"></div>
<noscript><div style="padding:24px;font:14px system-ui">Axil Studio needs JavaScript enabled.</div></noscript>
<script type="application/json" id="studio-boot">${boot}</script>
<script>${buildClientScript()}</script>
</body>
</html>`
}
