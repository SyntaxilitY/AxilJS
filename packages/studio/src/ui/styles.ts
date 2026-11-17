/**
 * Axil Studio — stylesheet.
 *
 * Design tokens are CSS custom properties with a full light and dark theme.
 * The active theme is `html[data-theme]`, set before first paint by a tiny
 * inline script (system preference → localStorage → ?theme= override).
 */

export function buildStyles(): string {
  return `<style>${CSS}</style>`
}

const CSS = /* css */ `
:root{
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Code", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --r-xs: 4px; --r-sm: 6px; --r: 8px; --r-lg: 12px;
  --sb-w: 232px; --sb-w-c: 56px; --tb-h: 52px;
  --ease: cubic-bezier(.2,.7,.2,1);
  --t-fast: 120ms; --t: 160ms;
  --brand-a: #FD8702; --brand-b: #ED1010; --brand-deep: #B70A0C;
  --brand-grad: linear-gradient(135deg, var(--brand-a), var(--brand-b));
}
html[data-theme="light"]{
  color-scheme: light;
  --bg: #f6f6f7; --surface: #ffffff; --surface-2: #f8f8f9; --surface-3: #f1f1f3; --hover: #f2f2f4; --active: #ebebef;
  --border: #e6e6e9; --border-2: #d9d9de; --border-strong: #c5c5cc;
  --text: #17171c; --text-2: #4b4b55; --text-3: #81818c; --text-4: #a5a5ae;
  --accent: #E8590C; --accent-hover: #D9480F; --accent-fg: #ffffff; --accent-soft: rgba(253,135,2,.1); --accent-soft-2: rgba(232,89,12,.2); --accent-text: #C2410C;
  --cyan: #0e9fb8;
  --ring: 0 0 0 3px rgba(232,89,12,.28);
  --ok: #15803d; --ok-soft: rgba(22,163,74,.1);
  --warn: #b45309; --warn-soft: rgba(217,119,6,.12);
  --err: #c81e1e; --err-soft: rgba(220,38,38,.09); --err-border: rgba(220,38,38,.28);
  --info: #2563eb; --info-soft: rgba(37,99,235,.09);
  --m-get: #15803d; --m-get-bg: rgba(22,163,74,.11);
  --m-post: #1d5fd8; --m-post-bg: rgba(37,99,235,.11);
  --m-put: #b45309; --m-put-bg: rgba(217,119,6,.13);
  --m-patch: #6d3fd4; --m-patch-bg: rgba(124,58,237,.11);
  --m-delete: #c81e1e; --m-delete-bg: rgba(220,38,38,.1);
  --m-other: #52525b; --m-other-bg: rgba(82,82,91,.1);
  --j-key: #6d3fd4; --j-str: #15803d; --j-num: #b45309; --j-bool: #1d5fd8; --j-null: #9a9aa5; --j-punc: #81818c;
  --s-kw: #5b5bd6; --s-fn: #0e7c91; --s-str: #15803d; --s-num: #b45309; --s-com: #9a9aa5;
  --shadow-sm: 0 1px 2px rgba(16,16,24,.05);
  --shadow: 0 1px 2px rgba(16,16,24,.04), 0 4px 12px rgba(16,16,24,.05);
  --shadow-lg: 0 12px 40px rgba(16,16,24,.14), 0 2px 8px rgba(16,16,24,.06);
  --overlay: rgba(20,20,28,.32);
  --skel-a: #efeff2; --skel-b: #f7f7f9;
  --grid-dot: #d6d6dc;
}
html[data-theme="dark"]{
  color-scheme: dark;
  --bg: #0b0b0e; --surface: #111115; --surface-2: #15151a; --surface-3: #1a1a20; --hover: #1b1b21; --active: #222229;
  --border: #23232a; --border-2: #2c2c34; --border-strong: #3a3a44;
  --text: #ececf1; --text-2: #a9a9b4; --text-3: #75757f; --text-4: #55555e;
  --accent: #FD8702; --accent-hover: #FF9A2E; --accent-fg: #1a0c00; --accent-soft: rgba(253,135,2,.12); --accent-soft-2: rgba(253,135,2,.24); --accent-text: #FFA94D;
  --cyan: #22d3ee;
  --ring: 0 0 0 3px rgba(253,135,2,.38);
  --ok: #4ade80; --ok-soft: rgba(74,222,128,.11);
  --warn: #fbbf24; --warn-soft: rgba(251,191,36,.12);
  --err: #f87171; --err-soft: rgba(248,113,113,.1); --err-border: rgba(248,113,113,.3);
  --info: #60a5fa; --info-soft: rgba(96,165,250,.11);
  --m-get: #4ade80; --m-get-bg: rgba(74,222,128,.11);
  --m-post: #60a5fa; --m-post-bg: rgba(96,165,250,.12);
  --m-put: #fbbf24; --m-put-bg: rgba(251,191,36,.12);
  --m-patch: #a78bfa; --m-patch-bg: rgba(167,139,250,.13);
  --m-delete: #f87171; --m-delete-bg: rgba(248,113,113,.12);
  --m-other: #a1a1aa; --m-other-bg: rgba(161,161,170,.12);
  --j-key: #b4a2fb; --j-str: #86efac; --j-num: #fcd34d; --j-bool: #93c5fd; --j-null: #75757f; --j-punc: #75757f;
  --s-kw: #a5adfb; --s-fn: #67e8f9; --s-str: #86efac; --s-num: #fcd34d; --s-com: #63636d;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.3);
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 4px 14px rgba(0,0,0,.25);
  --shadow-lg: 0 16px 48px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.35);
  --overlay: rgba(0,0,0,.55);
  --skel-a: #17171c; --skel-b: #1e1e24;
  --grid-dot: #26262d;
}

*,*::before,*::after{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:13.5px/1.5 var(--font);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;overflow:hidden}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
a{color:var(--accent-text);text-decoration:none}
a:hover{text-decoration:underline}
code,kbd,pre,.mono{font-family:var(--mono);font-size:12.5px}
:focus{outline:none}
:focus-visible{outline:none;box-shadow:var(--ring);border-radius:var(--r-sm)}
.ed-ta:focus-visible,.editor-box textarea:focus-visible,.pal-in input:focus-visible,.er-node:focus-visible{box-shadow:none}
.er-node:focus-visible .bg{stroke:var(--accent);stroke-width:2}
::selection{background:var(--accent-soft-2)}
.i{flex-shrink:0;display:block}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:10px;border:2px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:var(--border-strong);background-clip:padding-box;border:2px solid transparent}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-corner{background:transparent}

/* ── App shell ─────────────────────────────────────────── */
.app{display:grid;grid-template-columns:var(--sb-w) minmax(0,1fr);height:100vh;transition:grid-template-columns var(--t) var(--ease)}
html.sb-collapsed .app{grid-template-columns:var(--sb-w-c) minmax(0,1fr)}
.sb{display:flex;flex-direction:column;min-width:0;background:var(--surface);border-right:1px solid var(--border);overflow:hidden;z-index:30}
.sb-head{display:flex;align-items:center;gap:10px;height:var(--tb-h);padding:0 12px 0 14px;border-bottom:1px solid var(--border);flex-shrink:0}
.sb-logo{width:30px;height:30px;display:grid;place-items:center;flex-shrink:0}
.sb-logo img{width:30px;height:30px;display:block;filter:drop-shadow(0 1px 2px rgba(237,16,16,.25))}
.sb-titles{min-width:0;flex:1;line-height:1.2}
.sb-title{font-weight:650;font-size:13.5px;letter-spacing:-.01em;white-space:nowrap}
.sb-app{font-size:11.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--mono)}
.sb-collapse{color:var(--text-3)}
.sb-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:10px 8px;display:flex;flex-direction:column;gap:1px}
.sb-sec{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-4);padding:12px 10px 6px;white-space:nowrap}
.sb-sec:first-child{padding-top:4px}
.nav-item{display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;border-radius:var(--r-sm);color:var(--text-2);font-weight:500;white-space:nowrap;position:relative;transition:background var(--t-fast),color var(--t-fast)}
.nav-item:hover{background:var(--hover);color:var(--text);text-decoration:none}
.nav-item.active{background:var(--accent-soft);color:var(--accent-text)}
.nav-item.active::before{content:"";position:absolute;left:-8px;top:8px;bottom:8px;width:2px;border-radius:2px;background:var(--brand-grad)}
.nav-item .i{width:16px;height:16px;opacity:.9}
.nav-label{flex:1;overflow:hidden;text-overflow:ellipsis}
.nav-count{font-size:11px;font-weight:550;color:var(--text-3);background:var(--surface-3);border:1px solid var(--border);border-radius:10px;padding:0 6px;line-height:17px;min-width:20px;text-align:center;font-variant-numeric:tabular-nums}
.nav-item.active .nav-count{color:var(--accent-text);background:transparent;border-color:var(--accent-soft-2)}
.sb-foot{border-top:1px solid var(--border);padding:10px 12px;display:flex;flex-direction:column;gap:6px;flex-shrink:0}
.conn{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2);white-space:nowrap;min-width:0}
.conn-dot{width:8px;height:8px;border-radius:50%;background:var(--text-4);flex-shrink:0;box-shadow:0 0 0 3px transparent}
.conn-dot.on{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.16)}
.conn-dot.off{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.15)}
.conn-dot.wait{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.15)}
.conn-url{font-family:var(--mono);font-size:11.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px}
.conn-url:hover{color:var(--accent-text);text-decoration:none}
.conn-url .i{width:12px;height:12px}
html.sb-collapsed .sb-titles,html.sb-collapsed .nav-label,html.sb-collapsed .nav-count,html.sb-collapsed .sb-sec,html.sb-collapsed .conn-text,html.sb-collapsed .conn-url{display:none}
html.sb-collapsed .sb-head{padding:0 14px;justify-content:center}
html.sb-collapsed .sb-collapse{display:none}
html.sb-collapsed .nav-item{justify-content:center;padding:0}
html.sb-collapsed .sb-nav{padding:10px 8px}
html.sb-collapsed .sb-foot{align-items:center}
html.sb-collapsed .icon-btn.sb-expand{display:grid}
.icon-btn.sb-expand{display:none}

.main{display:flex;flex-direction:column;min-width:0;min-height:0;height:100vh}
.topbar{height:var(--tb-h);flex-shrink:0;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:saturate(1.4) blur(8px);z-index:20}
.icon-btn.tb-menu{display:none}
.crumbs{display:flex;align-items:center;gap:6px;min-width:0;flex:1;font-size:13px;color:var(--text-3);white-space:nowrap;overflow:hidden}
.crumbs a{color:var(--text-3)}
.crumbs a:hover{color:var(--text);text-decoration:none}
.crumbs .sep{color:var(--text-4);display:flex}
.crumbs .sep .i{width:14px;height:14px}
.crumbs .cur{color:var(--text);font-weight:550;overflow:hidden;text-overflow:ellipsis}
.crumbs .cur.mono{font-size:12.5px}
.tb-search{display:flex;align-items:center;gap:8px;height:32px;width:260px;padding:0 6px 0 10px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface-2);color:var(--text-3);font-size:13px;transition:border-color var(--t-fast),background var(--t-fast)}
.tb-search:hover{border-color:var(--border-2);background:var(--surface)}
.tb-search .i{width:14px;height:14px}
.tb-search span{flex:1;text-align:left}
.tb-search .kbd{flex:none}
.kbd{display:inline-flex;align-items:center;gap:2px;font-family:var(--font);font-size:11px;font-weight:550;color:var(--text-3);background:var(--surface);border:1px solid var(--border);border-bottom-width:2px;border-radius:5px;padding:0 5px;line-height:16px;min-width:18px;justify-content:center;white-space:nowrap}
.tb-actions{display:flex;align-items:center;gap:4px}
.content{flex:1;min-height:0;position:relative;overflow:hidden}
.view{position:absolute;inset:0;overflow:auto;animation:view-in var(--t) var(--ease)}
.view.page{padding:28px 32px 48px}
.view.full{display:flex;overflow:hidden}
.page-inner{max-width:1240px;margin:0 auto}
@keyframes view-in{from{transform:translateY(4px)}to{transform:none}}
.backdrop{display:none}

/* ── Typography helpers ───────────────────────────────── */
.ph{display:flex;align-items:flex-end;gap:16px;margin-bottom:22px;flex-wrap:wrap}
.ph-text{flex:1;min-width:240px}
.ph h1{font-size:21px;line-height:1.25;font-weight:650;letter-spacing:-.02em;margin:0 0 4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ph p{margin:0;color:var(--text-3);font-size:13.5px}
.ph-actions{display:flex;gap:8px;flex-wrap:wrap}
.h2{font-size:13px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px}
.muted{color:var(--text-3)}
.faint{color:var(--text-4)}
.num{font-variant-numeric:tabular-nums}
.ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grow{flex:1;min-width:0}
.row{display:flex;align-items:center;gap:8px}
.sp{flex:1}

/* ── Buttons & inputs ─────────────────────────────────── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--border-2);background:var(--surface);color:var(--text);font-size:13px;font-weight:550;white-space:nowrap;box-shadow:var(--shadow-sm);transition:background var(--t-fast),border-color var(--t-fast),color var(--t-fast),box-shadow var(--t-fast),transform var(--t-fast);user-select:none}
.btn:hover{background:var(--hover);border-color:var(--border-strong)}
.btn:active{transform:translateY(.5px)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn .i{width:14px;height:14px}
.btn-primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.btn-primary .kbd{background:rgba(255,255,255,.16);color:inherit;border-color:rgba(255,255,255,.28)}
.btn-primary:hover{background:var(--brand-grad);border-color:var(--accent-hover)}
.btn-ghost{background:transparent;border-color:transparent;box-shadow:none;color:var(--text-2)}
.btn-ghost:hover{background:var(--hover);border-color:transparent;color:var(--text)}
.btn-danger{color:var(--err)}
.btn-sm{height:28px;padding:0 10px;font-size:12.5px}
.btn-xs{height:24px;padding:0 8px;font-size:12px;border-radius:5px;gap:5px}
.btn-xs .i{width:13px;height:13px}
.btn.on{background:var(--accent-soft);border-color:var(--accent-soft-2);color:var(--accent-text)}
.icon-btn{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:var(--r-sm);color:var(--text-2);transition:background var(--t-fast),color var(--t-fast)}
.icon-btn:hover{background:var(--hover);color:var(--text)}
.icon-btn.sm{width:26px;height:26px}
.icon-btn.sm .i{width:14px;height:14px}
.icon-btn.on{color:var(--accent-text);background:var(--accent-soft)}
.icon-btn:disabled{opacity:.4;cursor:not-allowed}
.spin .i,.i.spin{animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.input,.select,.textarea{height:32px;padding:0 10px;border:1px solid var(--border-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:13px;min-width:0;transition:border-color var(--t-fast),box-shadow var(--t-fast)}
.input::placeholder,.textarea::placeholder{color:var(--text-4)}
.input:hover,.select:hover,.textarea:hover{border-color:var(--border-strong)}
.input:focus,.select:focus,.textarea:focus{border-color:var(--accent);box-shadow:var(--ring)}
.input.sm,.select.sm{height:28px;font-size:12.5px;padding:0 8px}
.input.mono{font-family:var(--mono);font-size:12.5px}
.select{padding-right:28px;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--text-3) 50%),linear-gradient(135deg,var(--text-3) 50%,transparent 50%);background-position:calc(100% - 14px) 50%,calc(100% - 10px) 50%;background-size:4px 4px;background-repeat:no-repeat;cursor:pointer}
.textarea{height:auto;padding:8px 10px;resize:vertical;line-height:1.5}
.search{position:relative;display:flex;align-items:center;min-width:0}
.search .i{position:absolute;left:9px;width:14px;height:14px;color:var(--text-3);pointer-events:none}
.search .input{padding-left:30px;width:100%}
.search .clear{position:absolute;right:4px}
.check{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.check input{accent-color:var(--accent);width:14px;height:14px;margin:0}

/* ── Badges, pills, methods ───────────────────────────── */
.badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:5px;font-size:11px;font-weight:600;letter-spacing:.01em;white-space:nowrap;border:1px solid var(--border);color:var(--text-2);background:var(--surface-2)}
.badge .i{width:11px;height:11px}
.badge.accent{color:var(--accent-text);background:var(--accent-soft);border-color:var(--accent-soft-2)}
.badge.ok{color:var(--ok);background:var(--ok-soft);border-color:transparent}
.badge.warn{color:var(--warn);background:var(--warn-soft);border-color:transparent}
.badge.err{color:var(--err);background:var(--err-soft);border-color:transparent}
.badge.info{color:var(--info);background:var(--info-soft);border-color:transparent}
.badge.pk{color:var(--warn);background:var(--warn-soft);border-color:transparent}
.badge.fk{color:var(--info);background:var(--info-soft);border-color:transparent}
.badge.uq{color:var(--m-patch);background:var(--m-patch-bg);border-color:transparent}
.badge.ghost{background:transparent}
.method{display:inline-flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10.5px;font-weight:700;letter-spacing:.02em;height:20px;min-width:52px;padding:0 6px;border-radius:5px;color:var(--m-other);background:var(--m-other-bg);flex-shrink:0}
.method.sm{min-width:44px;height:18px;font-size:10px}
.method.GET{color:var(--m-get);background:var(--m-get-bg)}
.method.POST{color:var(--m-post);background:var(--m-post-bg)}
.method.PUT{color:var(--m-put);background:var(--m-put-bg)}
.method.PATCH{color:var(--m-patch);background:var(--m-patch-bg)}
.method.DELETE{color:var(--m-delete);background:var(--m-delete-bg)}
.mtext.GET{color:var(--m-get)}.mtext.POST{color:var(--m-post)}.mtext.PUT{color:var(--m-put)}.mtext.PATCH{color:var(--m-patch)}.mtext.DELETE{color:var(--m-delete)}
.mbg.GET{background:var(--m-get)}.mbg.POST{background:var(--m-post)}.mbg.PUT{background:var(--m-put)}.mbg.PATCH{background:var(--m-patch)}.mbg.DELETE{background:var(--m-delete)}.mbg.OTHER{background:var(--m-other)}
.path{font-family:var(--mono);font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.path .p{color:var(--accent-text);font-weight:600}
.path .s{color:var(--text-4)}
.status{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:5px;font-family:var(--mono);font-size:12px;font-weight:650}
.status.s2{color:var(--ok);background:var(--ok-soft)}
.status.s3{color:var(--info);background:var(--info-soft)}
.status.s4{color:var(--warn);background:var(--warn-soft)}
.status.s5,.status.serr{color:var(--err);background:var(--err-soft)}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0}
.tag{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:4px;font-size:11px;font-family:var(--mono);background:var(--surface-3);color:var(--text-2);border:1px solid var(--border);white-space:nowrap}
.tag.auth{color:var(--warn);background:var(--warn-soft);border-color:transparent}

/* ── Cards ─────────────────────────────────────────────── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);min-width:0}
.card-h{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);min-height:48px}
.card-h .h2{flex:1;min-width:0}
.card-h .h2 .i{width:15px;height:15px;color:var(--text-3)}
.card-b{padding:16px}
.card-f{padding:10px 16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px}
.list-row{display:flex;align-items:center;gap:10px;padding:9px 16px;border-top:1px solid var(--border);min-width:0;color:var(--text);transition:background var(--t-fast)}
.list-row:first-child{border-top:0}
a.list-row:hover,button.list-row:hover{background:var(--hover);text-decoration:none}
button.list-row{width:100%;text-align:left}

/* ── Overview ─────────────────────────────────────────── */
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.stat{padding:16px;display:flex;flex-direction:column;gap:2px;position:relative;overflow:hidden;transition:border-color var(--t-fast),box-shadow var(--t-fast)}
a.stat:hover{text-decoration:none;border-color:var(--border-2);box-shadow:var(--shadow)}
.stat-top{display:flex;align-items:center;justify-content:space-between;color:var(--text-3);font-size:12.5px;font-weight:500}
.stat-ico{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:var(--surface-3);color:var(--text-2)}
.stat-ico .i{width:15px;height:15px}
.stat-val{font-size:26px;font-weight:650;letter-spacing:-.025em;line-height:1.25;color:var(--text);margin-top:4px;font-variant-numeric:tabular-nums}
.stat-sub{font-size:12px;color:var(--text-3)}
.mbar{display:flex;height:6px;border-radius:4px;overflow:hidden;gap:2px;margin-top:10px;background:var(--surface-3)}
.mbar span{display:block;height:100%;min-width:3px}
.mlegend{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:8px;font-size:11px;color:var(--text-3)}
.mlegend span{display:inline-flex;align-items:center;gap:5px}
.mlegend i{width:7px;height:7px;border-radius:2px;display:inline-block}
.ov-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;margin-bottom:16px}
.quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--border);border-radius:0 0 var(--r-lg) var(--r-lg);overflow:hidden}
.quick a{background:var(--surface);padding:14px 16px;display:flex;gap:12px;align-items:flex-start;color:var(--text);transition:background var(--t-fast)}
.quick a:hover{background:var(--hover);text-decoration:none}
.quick .qi{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-text);flex-shrink:0}
.quick .qi .i{width:15px;height:15px}
.quick b{display:block;font-weight:600;font-size:13px}
.quick small{display:block;color:var(--text-3);font-size:12px;line-height:1.4;margin-top:1px}
.bars .list-row{flex-wrap:wrap;row-gap:6px}
.bar-track{flex-basis:100%;height:4px;border-radius:3px;background:var(--surface-3);overflow:hidden}
.bar-fill{height:100%;border-radius:3px;background:var(--accent);opacity:.85}
.hist-sql{font-family:var(--mono);font-size:12px;color:var(--text-2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Split layouts ─────────────────────────────────────── */
.pane{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--surface);border-right:1px solid var(--border)}
.pane-l{width:300px;flex-shrink:0}
.pane-l.narrow{width:248px}
.pane-h{padding:12px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px;flex-shrink:0}
.pane-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em}
.pane-title .sp{flex:1}
.pane-b{flex:1;overflow:auto;min-height:0}
.workspace{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg)}
.chips{display:flex;gap:4px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:12px;border:1px solid var(--border);background:var(--surface);font-size:11.5px;font-weight:600;color:var(--text-2);transition:all var(--t-fast);white-space:nowrap}
.chip:hover{border-color:var(--border-2);color:var(--text)}
.chip.on{background:var(--accent-soft);border-color:var(--accent-soft-2);color:var(--accent-text)}
.chip.mchip.on.GET{background:var(--m-get-bg);color:var(--m-get);border-color:transparent}
.chip.mchip.on.POST{background:var(--m-post-bg);color:var(--m-post);border-color:transparent}
.chip.mchip.on.PUT{background:var(--m-put-bg);color:var(--m-put);border-color:transparent}
.chip.mchip.on.PATCH{background:var(--m-patch-bg);color:var(--m-patch);border-color:transparent}
.chip.mchip.on.DELETE{background:var(--m-delete-bg);color:var(--m-delete);border-color:transparent}
.chip small{font-weight:500;opacity:.75}
.group-h{display:flex;align-items:center;gap:6px;width:100%;padding:12px 14px 6px;font-family:var(--mono);font-size:11.5px;font-weight:600;color:var(--text-3)}
.group-h:hover{color:var(--text)}
.group-h .i{width:12px;height:12px;transition:transform var(--t-fast)}
.group-h.closed .i{transform:rotate(-90deg)}
.group-h .cnt{margin-left:auto;font-weight:500}
.ep{display:flex;align-items:center;gap:10px;width:100%;padding:6px 14px;min-height:34px;text-align:left;border-left:2px solid transparent;color:var(--text);transition:background var(--t-fast)}
.ep:hover{background:var(--hover);text-decoration:none}
.ep.active{background:var(--accent-soft);border-left-color:var(--accent)}
.ep .path{flex:1;min-width:0}
.ep .lock{color:var(--warn)}
.ep .lock .i{width:12px;height:12px}
.tbl-item{display:flex;align-items:center;gap:10px;width:100%;padding:7px 12px;text-align:left;color:var(--text);border-left:2px solid transparent;transition:background var(--t-fast)}
.tbl-item:hover{background:var(--hover);text-decoration:none}
.tbl-item.active{background:var(--accent-soft);border-left-color:var(--accent)}
.tbl-item .i{width:15px;height:15px;color:var(--text-3)}
.tbl-item.active .i{color:var(--accent-text)}
.tbl-item .nm{flex:1;min-width:0;font-family:var(--mono);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbl-item .meta{font-size:11px;color:var(--text-3);font-variant-numeric:tabular-nums;text-align:right;line-height:1.2;white-space:nowrap}

/* ── Tabs ──────────────────────────────────────────────── */
.tabs{display:flex;align-items:stretch;gap:2px;border-bottom:1px solid var(--border);padding:0 16px;flex-shrink:0;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{position:relative;display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 10px;color:var(--text-3);font-weight:550;font-size:13px;white-space:nowrap;transition:color var(--t-fast)}
.tab:hover{color:var(--text);text-decoration:none}
.tab.active{color:var(--text)}
.tab.active::after{content:"";position:absolute;left:8px;right:8px;bottom:-1px;height:2px;border-radius:2px;background:var(--brand-grad)}
.tab .i{width:14px;height:14px}
.tab .cnt{font-size:11px;color:var(--text-3);background:var(--surface-3);border-radius:8px;padding:0 6px;line-height:16px}
.tabs.sm .tab{height:34px;font-size:12.5px}
.seg{display:inline-flex;padding:2px;gap:2px;border-radius:7px;background:var(--surface-3);border:1px solid var(--border)}
.seg button{height:24px;padding:0 10px;border-radius:5px;font-size:12px;font-weight:550;color:var(--text-3);transition:all var(--t-fast)}
.seg button:hover{color:var(--text)}
.seg button.on{background:var(--surface);color:var(--text);box-shadow:var(--shadow-sm)}

/* ── Request builder ───────────────────────────────────── */
.rb{flex:1;overflow:auto;padding:20px 24px 32px;min-width:0}
.rb-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.rb-head h2{margin:0;font-family:var(--mono);font-size:16px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;min-width:0;word-break:break-all}
.rb-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;font-size:12px;color:var(--text-3)}
.urlbar{display:flex;align-items:stretch;border:1px solid var(--border-2);border-radius:var(--r);background:var(--surface);box-shadow:var(--shadow-sm);overflow:hidden;margin-bottom:16px;min-height:40px}
.urlbar:focus-within{border-color:var(--accent);box-shadow:var(--ring)}
.urlbar .method{height:auto;border-radius:0;min-width:72px;font-size:12px}
.urlbar-url{flex:1;min-width:0;display:flex;align-items:center;padding:0 12px;font-family:var(--mono);font-size:12.5px;overflow-x:auto;white-space:nowrap;color:var(--text-2);scrollbar-width:none}
.urlbar-url::-webkit-scrollbar{display:none}
.urlbar-url .base{color:var(--text-3)}
.urlbar-url .p{color:var(--accent-text)}
.urlbar-url .q{color:var(--text-3)}
.urlbar .btn{border-radius:0;border:0;border-left:1px solid var(--border-2);height:auto;box-shadow:none;padding:0 14px}
.urlbar .btn-primary{border-left-color:var(--accent);min-width:96px}
.rb-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.kv{display:flex;flex-direction:column}
.kv-row{display:grid;grid-template-columns:22px minmax(0,1fr) minmax(0,1.4fr) 28px;gap:6px;align-items:center;padding:4px 0}
.kv-row .input{height:30px;font-family:var(--mono);font-size:12.5px}
.kv-row.off .input{opacity:.5}
.kv-head{display:grid;grid-template-columns:22px minmax(0,1fr) minmax(0,1.4fr) 28px;gap:6px;font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;padding:0 0 4px}
.kv-head span:nth-child(2){padding-left:2px}
.sect{margin-bottom:18px}
.sect:last-child{margin-bottom:0}
.sect-h{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;font-weight:600;color:var(--text-2)}
.sect-h .sp{flex:1}
.param-row{display:grid;grid-template-columns:140px minmax(0,1fr);gap:10px;align-items:center;padding:4px 0}
.param-row label{font-family:var(--mono);font-size:12.5px;color:var(--accent-text);font-weight:600}
.param-row label small{display:block;font-family:var(--font);color:var(--text-4);font-weight:500;font-size:11px}
.hint{font-size:12px;color:var(--text-3);display:flex;align-items:center;gap:6px}
.hint .i{width:13px;height:13px}
.editor-box{border:1px solid var(--border-2);border-radius:var(--r);background:var(--surface);overflow:hidden}
.editor-box:focus-within{border-color:var(--accent);box-shadow:var(--ring)}
.editor-box textarea{display:block;width:100%;min-height:180px;border:0;outline:0;resize:vertical;padding:12px 14px;background:transparent;font-family:var(--mono);font-size:12.5px;line-height:1.6;tab-size:2;color:var(--text)}
.editor-bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:6px 8px;border-bottom:1px solid var(--border);background:var(--surface-2)}
.resp{margin-top:4px}
.resp-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--border)}
.resp-h .tabs{border:0;padding:0;margin-left:auto}
.resp-h .tabs .tab{height:28px}
.resp-h .tabs .tab.active::after{bottom:-11px}
.resp-meta{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--text-3);font-variant-numeric:tabular-nums}
.resp-meta b{color:var(--text-2);font-weight:600}
.code{margin:0;padding:14px 16px;font-family:var(--mono);font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--text);overflow:auto;max-height:520px;tab-size:2}
.code.nowrap{white-space:pre;word-break:normal}
.j-key{color:var(--j-key)}.j-str{color:var(--j-str)}.j-num{color:var(--j-num)}.j-bool{color:var(--j-bool)}.j-null{color:var(--j-null);font-style:italic}.j-punc{color:var(--j-punc)}
.hdr-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.hdr-tbl td{padding:7px 16px;border-top:1px solid var(--border);vertical-align:top}
.hdr-tbl tr:first-child td{border-top:0}
.hdr-tbl td:first-child{font-family:var(--mono);color:var(--text-2);width:34%;white-space:nowrap}
.hdr-tbl td:last-child{font-family:var(--mono);word-break:break-all}
.hist-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--border);width:100%;text-align:left;transition:background var(--t-fast)}
.hist-item:first-child{border-top:0}
.hist-item:hover{background:var(--hover)}
.hist-item .path{flex:1;font-size:12px;color:var(--text-2)}
.hist-item time{font-size:11.5px;color:var(--text-3);white-space:nowrap}

/* ── State blocks ──────────────────────────────────────── */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 24px;gap:6px;color:var(--text-3);min-height:200px}
.empty.fill{flex:1;height:100%}
.empty.sm{padding:24px 16px;min-height:0}
.empty-ico{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--surface-3);color:var(--text-3);margin-bottom:8px;border:1px solid var(--border)}
.empty-ico .i{width:20px;height:20px}
.empty.err .empty-ico{background:var(--err-soft);color:var(--err);border-color:var(--err-border)}
.empty h3{margin:0;font-size:14px;font-weight:600;color:var(--text)}
.empty p{margin:0;max-width:440px;font-size:13px;line-height:1.55}
.empty code{background:var(--surface-3);border:1px solid var(--border);padding:1px 5px;border-radius:4px;font-size:12px;color:var(--text-2)}
.empty .btn{margin-top:10px}
.alert{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:var(--r);border:1px solid var(--err-border);background:var(--err-soft);color:var(--text);font-size:13px}
.alert .i{width:16px;height:16px;color:var(--err);margin-top:1px}
.alert b{display:block;font-weight:600;margin-bottom:2px}
.alert pre{margin:6px 0 0;font-family:var(--mono);font-size:12px;white-space:pre-wrap;word-break:break-word;color:var(--err)}
.alert.info{border-color:var(--accent-soft-2);background:var(--accent-soft)}
.alert.info .i{color:var(--accent-text)}
.notice{display:inline-flex;align-items:center;white-space:nowrap;gap:6px;font-size:12px;color:var(--text-3)}
.notice .i{width:13px;height:13px}
.skel{border-radius:5px;background:linear-gradient(90deg,var(--skel-a) 25%,var(--skel-b) 37%,var(--skel-a) 63%);background-size:400% 100%;animation:skel 1.3s ease infinite}
@keyframes skel{0%{background-position:100% 50%}100%{background-position:0 50%}}
.skel-line{height:12px;margin:10px 0}
.skel-card{height:118px;border-radius:var(--r-lg)}

/* ── Data grid ─────────────────────────────────────────── */
.db-head{display:flex;align-items:center;gap:12px;padding:14px 20px 0;background:var(--surface);flex-wrap:wrap}
.db-title{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.db-title h1{font-family:var(--mono);font-size:16px;font-weight:600;margin:0;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-title .i{width:18px;height:18px;color:var(--text-3)}
.db-tabs{background:var(--surface);padding:6px 12px 0}
.toolbar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);background:var(--surface);flex-wrap:wrap;flex-shrink:0}
.toolbar .search{width:260px}
.filters{display:flex;flex-wrap:wrap;gap:6px;padding:8px 16px;border-bottom:1px solid var(--border);background:var(--surface-2);flex-shrink:0;align-items:center}
.fchip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 4px 0 9px;border-radius:6px;background:var(--surface);border:1px solid var(--border-2);font-size:12px;box-shadow:var(--shadow-sm)}
.fchip .c{font-family:var(--mono);font-weight:600;color:var(--text)}
.fchip .o{color:var(--accent-text);font-weight:600;font-size:11.5px}
.fchip .v{font-family:var(--mono);color:var(--text-2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grid-wrap{flex:1;min-height:0;overflow:auto;background:var(--surface);position:relative}
.grid{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%}
.grid th{position:sticky;top:0;z-index:2;background:var(--surface-2);text-align:left;font-weight:600;color:var(--text-2);height:34px;padding:0 12px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);white-space:nowrap;user-select:none}
.grid th.sortable{cursor:pointer}
.grid th.sortable:hover{background:var(--hover);color:var(--text)}
.grid th .th{display:flex;align-items:center;gap:6px}
.grid th .ty{font-weight:500;color:var(--text-4);font-family:var(--mono);font-size:10.5px;text-transform:lowercase}
.grid th .i{width:12px;height:12px}
.grid th .key{color:var(--warn)}
.grid th .fkey{color:var(--info)}
.grid th .sort-ind{color:var(--accent-text)}
.grid td{padding:0 12px;height:34px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);white-space:nowrap;max-width:340px;overflow:hidden;text-overflow:ellipsis;color:var(--text);font-family:var(--mono);font-size:12px}
.grid th:last-child,.grid td:last-child{border-right:0}
.grid .fill{width:100%;padding:0;max-width:none}
.grid tbody tr{cursor:pointer;transition:background 80ms}
.grid tbody tr:hover td{background:var(--hover)}
.grid tbody tr.sel td{background:var(--accent-soft)}
.grid .rn{position:sticky;left:0;z-index:1;background:var(--surface-2);color:var(--text-4);text-align:right;width:1%;min-width:48px;font-size:11px;padding:0 10px;font-family:var(--mono)}
.grid th.rn{z-index:3}
.grid td.n{text-align:right;font-variant-numeric:tabular-nums}
.grid td.copied{box-shadow:inset 0 0 0 2px var(--accent)}
.nullp{display:inline-flex;align-items:center;height:17px;padding:0 5px;border-radius:4px;background:var(--surface-3);color:var(--text-4);font-size:10px;font-weight:700;letter-spacing:.04em;font-family:var(--font)}
.boolp{display:inline-flex;align-items:center;gap:4px;font-family:var(--font);font-size:11.5px;font-weight:600}
.boolp.t{color:var(--ok)}.boolp.f{color:var(--text-3)}
.boolp .i{width:12px;height:12px}
.jsonp{color:var(--text-2)}
.jsonp b{font-weight:600;color:var(--j-key);font-family:var(--font);font-size:10px;letter-spacing:.04em;margin-right:6px;padding:1px 4px;border-radius:3px;background:var(--m-patch-bg)}
.datep{color:var(--text)}
.datep span{color:var(--text-3)}
.fklink{display:inline-flex;align-items:center;gap:4px;color:var(--info);border-bottom:1px dashed transparent;font-family:var(--mono)}
.fklink:hover{border-bottom-color:currentColor;text-decoration:none}
.fklink .i{width:11px;height:11px;opacity:.7}
.gfoot{display:flex;align-items:center;gap:10px;padding:8px 16px;border-top:1px solid var(--border);background:var(--surface);font-size:12.5px;color:var(--text-3);flex-shrink:0;flex-wrap:wrap}
.gfoot b{color:var(--text-2);font-weight:600}
.pager{display:flex;align-items:center;gap:4px;margin-left:auto}
.pager .input{width:52px;text-align:center;height:28px;padding:0 4px}
.grid-err{padding:24px}

/* ── Structure / relations ─────────────────────────────── */
.scroll-pad{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:16px;min-height:0}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);padding:9px 16px;border-bottom:1px solid var(--border);background:var(--surface-2);white-space:nowrap}
.tbl td{padding:9px 16px;border-bottom:1px solid var(--border);vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}
.tbl tbody tr{transition:background var(--t-fast)}
.tbl tbody tr:hover td{background:var(--surface-2)}
.tbl .mono{font-size:12.5px}
.tbl .badges{display:flex;gap:4px;flex-wrap:wrap}
.tbl-scroll{overflow-x:auto}
.rel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.rel{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--border);font-family:var(--mono);font-size:12.5px;width:100%;text-align:left;color:var(--text);transition:background var(--t-fast);flex-wrap:wrap}
.rel:first-child{border-top:0}
.rel:hover{background:var(--hover);text-decoration:none}
.rel .i{width:14px;height:14px;color:var(--text-3)}
.rel .t{font-weight:600}
.rel .c{color:var(--accent-text)}

/* ── ER diagram ────────────────────────────────────────── */
.er{flex:1;position:relative;overflow:hidden;background-color:var(--bg);background-image:radial-gradient(var(--grid-dot) 1px,transparent 1px);background-size:20px 20px;cursor:grab;touch-action:none}
.er.dragging{cursor:grabbing}
.er svg{display:block;width:100%;height:100%}
.er-ctrl{position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.er-ctrl button{width:34px;height:34px;display:grid;place-items:center;color:var(--text-2);border-top:1px solid var(--border)}
.er-ctrl button:first-child{border-top:0}
.er-ctrl button:hover{background:var(--hover);color:var(--text)}
.er-ctrl .i{width:15px;height:15px}
.er-legend{position:absolute;left:16px;bottom:16px;display:flex;gap:12px;align-items:center;padding:6px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow-sm);font-size:11.5px;color:var(--text-3)}
.er-legend span{display:inline-flex;align-items:center;gap:5px}
.er-zoom{position:absolute;right:62px;bottom:16px;height:26px;padding:0 8px;display:flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:11.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.er-node{cursor:pointer}
.er-node .bg{fill:var(--surface);stroke:var(--border-2);stroke-width:1}
.er-node:hover .bg{stroke:var(--accent)}
.er-node .hd{fill:var(--surface-3)}
.er-node .ttl{fill:var(--text);font:600 12.5px var(--mono)}
.er-node .cnt{fill:var(--text-3);font:500 10.5px var(--font)}
.er-node .col{fill:var(--text-2);font:400 11.5px var(--mono)}
.er-node .typ{fill:var(--text-4);font:400 10.5px var(--mono)}
.er-node .pk{fill:var(--warn);font:700 9px var(--font)}
.er-node .fk{fill:var(--info);font:700 9px var(--font)}
.er-node .sep{stroke:var(--border);stroke-width:1}
.er-node.dim{opacity:.35}
.er-edge{fill:none;stroke:var(--border-strong);stroke-width:1.4}
.er-edge.hl{stroke:var(--accent);stroke-width:2}
.er-dot{fill:var(--surface);stroke:var(--border-strong);stroke-width:1.4}
.er-dot.hl{stroke:var(--accent)}

/* ── SQL console ───────────────────────────────────────── */
.sql-main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.sql-editor-wrap{background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column}
.sql-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border)}
.ed{position:relative;display:flex;height:220px;min-height:120px;max-height:60vh;resize:vertical;overflow:hidden;font-family:var(--mono);font-size:13px;line-height:20px}
.ed-gutter{flex-shrink:0;width:44px;padding:10px 8px 10px 0;text-align:right;color:var(--text-4);background:var(--surface-2);border-right:1px solid var(--border);overflow:hidden;user-select:none;font-size:12px;font-variant-numeric:tabular-nums}
.ed-gutter div{height:20px}
.ed-area{position:relative;flex:1;min-width:0}
.ed-hl,.ed-ta{position:absolute;inset:0;margin:0;padding:10px 14px;font:inherit;line-height:inherit;white-space:pre;overflow:auto;tab-size:2;letter-spacing:0;word-spacing:0}
.ed-hl{pointer-events:none;color:var(--text);scrollbar-width:none}
.ed-hl::-webkit-scrollbar{display:none}
.ed-ta{border:0;outline:0;resize:none;background:transparent;color:transparent;caret-color:var(--text);-webkit-text-fill-color:transparent}
.ed-ta::selection{background:var(--accent-soft-2);-webkit-text-fill-color:transparent}
.ed-ta::placeholder{color:var(--text-4);-webkit-text-fill-color:var(--text-4)}
.s-kw{color:var(--s-kw);font-weight:600}.s-fn{color:var(--s-fn)}.s-str{color:var(--s-str)}.s-num{color:var(--s-num)}.s-com{color:var(--s-com);font-style:italic}.s-op{color:var(--text-3)}
.sql-res{flex:1;display:flex;flex-direction:column;min-height:0}
.sql-res-h{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);background:var(--surface);font-size:12.5px;color:var(--text-3);flex-shrink:0;min-height:44px}
.tree-t{display:flex;align-items:center;gap:8px;width:100%;padding:6px 12px;text-align:left;font-family:var(--mono);font-size:12.5px;color:var(--text)}
.tree-t:hover{background:var(--hover)}
.tree-t .i{width:13px;height:13px;color:var(--text-3)}
.tree-t .chev{transition:transform var(--t-fast)}
.tree-t.open .chev{transform:rotate(90deg)}
.tree-t .sp{flex:1}
.tree-t small{font-family:var(--font);color:var(--text-4);font-size:11px}
.tree-c{display:flex;align-items:center;gap:8px;width:100%;padding:4px 12px 4px 34px;text-align:left;font-family:var(--mono);font-size:12px;color:var(--text-2)}
.tree-c:hover{background:var(--hover);color:var(--text)}
.tree-c small{margin-left:auto;color:var(--text-4);font-size:10.5px;text-transform:lowercase}
.tree-c .k{font-size:9px;font-weight:700;font-family:var(--font)}
.tree-c .k.pk{color:var(--warn)}.tree-c .k.fk{color:var(--info)}
.snip{display:flex;flex-direction:column;gap:3px;width:100%;padding:9px 12px;border-top:1px solid var(--border);text-align:left}
.snip:first-child{border-top:0}
.snip:hover{background:var(--hover)}
.snip-top{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}
.snip-top .sp{flex:1}
.snip-top time{font-weight:400;color:var(--text-4);font-size:11px}
.snip code{font-size:11.5px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.snip .acts{display:flex;gap:2px;opacity:0;transition:opacity var(--t-fast)}
.snip:hover .acts,.snip:focus-within .acts{opacity:1}

/* ── Realtime ──────────────────────────────────────────── */
.rt-list{display:flex;flex-direction:column;gap:16px}
.rt-card .card-h{flex-wrap:wrap}
.rt-kind{display:inline-flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10.5px;font-weight:700;height:20px;min-width:40px;padding:0 6px;border-radius:5px;color:var(--cyan);background:color-mix(in srgb,var(--cyan) 12%,transparent)}
.rt-kind.sse{color:var(--m-patch);background:var(--m-patch-bg)}
.rt-url{font-family:var(--mono);font-size:12px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.rt-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:550;color:var(--text-3)}
.rt-state.on{color:var(--ok)}.rt-state.err{color:var(--err)}.rt-state.wait{color:var(--warn)}
.rt-body{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);min-height:340px}
.rt-body.single{grid-template-columns:minmax(0,1fr)}
.rt-compose{border-right:1px solid var(--border);padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.rt-compose textarea{flex:1;min-height:150px;font-family:var(--mono);font-size:12.5px}
.rt-log-wrap{display:flex;flex-direction:column;min-width:0;min-height:0}
.rt-log-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border)}
.rt-log-bar .search{flex:1;max-width:260px}
.rt-log{flex:1;overflow:auto;max-height:380px;min-height:260px;font-family:var(--mono);font-size:12px;background:var(--surface-2)}
.rt-log .empty{font-family:var(--font);font-size:13px}
.rt-ev{display:grid;grid-template-columns:62px 18px minmax(0,1fr);gap:8px;padding:6px 12px;border-bottom:1px solid var(--border);align-items:start}
.rt-ev time{color:var(--text-4);font-size:11px;padding-top:1px}
.rt-ev .d{display:grid;place-items:center;width:18px;height:18px;border-radius:4px}
.rt-ev .d .i{width:12px;height:12px}
.rt-ev.in .d{color:var(--ok);background:var(--ok-soft)}
.rt-ev.out .d{color:var(--info);background:var(--info-soft)}
.rt-ev.sys .d{color:var(--text-3);background:var(--surface-3)}
.rt-ev.err .d{color:var(--err);background:var(--err-soft)}
.rt-ev.sys .msg{color:var(--text-3);font-family:var(--font);font-size:12px}
.rt-ev.err .msg{color:var(--err);font-family:var(--font);font-size:12px}
.rt-ev .msg{white-space:pre-wrap;word-break:break-word;min-width:0}
.rt-ev .evn{display:inline-block;font-family:var(--font);font-size:10.5px;font-weight:600;color:var(--m-patch);background:var(--m-patch-bg);padding:0 5px;border-radius:3px;margin-right:6px}
.rt-events{display:flex;flex-wrap:wrap;gap:4px}
.sec-h{display:flex;align-items:center;gap:8px;margin:24px 0 10px;font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em}
.sec-h:first-child{margin-top:0}
.sec-h .cnt{font-weight:500}

/* ── Export / QR ───────────────────────────────────────── */
.exp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:24px}
.exp{display:flex;flex-direction:column;gap:12px;padding:18px}
.exp-top{display:flex;align-items:center;gap:12px}
.exp-ico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex-shrink:0}
.exp-ico .i{width:19px;height:19px}
.exp-ico.postman{background:rgba(255,108,55,.12);color:#f26b3a}
.exp-ico.insomnia{background:rgba(124,58,237,.12);color:var(--m-patch)}
.exp-ico.openapi{background:rgba(22,163,74,.12);color:var(--m-get)}
.exp h3{margin:0;font-size:14px;font-weight:600}
.exp p{margin:0;font-size:12.5px;color:var(--text-3);line-height:1.5;flex:1}
.exp-acts{display:flex;gap:8px}
.exp-acts .btn{flex:1}
.qr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;max-width:860px}
.qr{display:flex;flex-direction:column;align-items:center;gap:14px;padding:28px 20px 22px;text-align:center}
.qr-frame{width:212px;height:212px;border-radius:16px;background:#fff;padding:14px;display:grid;place-items:center;border:1px solid var(--border);box-shadow:var(--shadow)}
.qr-frame img{width:100%;height:100%;image-rendering:pixelated;display:block}
.qr-frame .empty{min-height:0;padding:0}
.qr h3{margin:0;font-size:14px;font-weight:600}
.qr-url{font-family:var(--mono);font-size:12.5px;color:var(--accent-text);word-break:break-all}
.qr-acts{display:flex;gap:8px}

/* ── Overlays: drawer, modal, palette, menus ───────────── */
.overlay{position:fixed;inset:0;background:var(--overlay);z-index:80;animation:fade var(--t) var(--ease)}
@keyframes fade{from{opacity:0}to{opacity:1}}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(520px,100vw);background:var(--surface);border-left:1px solid var(--border);box-shadow:var(--shadow-lg);z-index:81;display:flex;flex-direction:column;animation:slide-in 180ms var(--ease)}
@keyframes slide-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
.drawer-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border)}
.drawer-h h3{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;font-family:var(--mono)}
.drawer-b{flex:1;overflow:auto}
.drawer-f{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border)}
.field{padding:12px 16px;border-bottom:1px solid var(--border)}
.field-h{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.field-h .nm{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--text-2)}
.field-h .ty{font-family:var(--mono);font-size:10.5px;color:var(--text-4);text-transform:lowercase}
.field-h .sp{flex:1}
.field-h .icon-btn{opacity:0;transition:opacity var(--t-fast)}
.field:hover .field-h .icon-btn,.field-h .icon-btn:focus-visible{opacity:1}
.field-v{font-family:var(--mono);font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--text);max-height:320px;overflow:auto}
.field-v.code{padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);max-height:320px}
.modal{position:fixed;left:50%;top:12vh;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));background:var(--surface);border:1px solid var(--border-2);border-radius:14px;box-shadow:var(--shadow-lg);z-index:81;overflow:hidden;animation:pop 160ms var(--ease)}
@keyframes pop{from{opacity:0;transform:translateX(-50%) scale(.98) translateY(-4px)}to{opacity:1;transform:translateX(-50%)}}
.modal-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border)}
.modal-h h3{margin:0;font-size:14px;font-weight:600;flex:1}
.modal-b{padding:16px;max-height:65vh;overflow:auto}
.modal-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--border);background:var(--surface-2)}
.pal-in{display:flex;align-items:center;gap:10px;padding:0 16px;height:52px;border-bottom:1px solid var(--border)}
.pal-in .i{width:17px;height:17px;color:var(--text-3)}
.pal-in input{flex:1;border:0;outline:0;background:transparent;font-size:15px;height:100%}
.pal-in input::placeholder{color:var(--text-4)}
.pal-list{max-height:min(420px,56vh);overflow:auto;padding:6px}
.pal-g{font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.05em;padding:10px 10px 4px}
.pal-it{display:flex;align-items:center;gap:10px;width:100%;padding:0 10px;height:36px;border-radius:7px;text-align:left;color:var(--text)}
.pal-it .i{width:15px;height:15px;color:var(--text-3)}
.pal-it .lb{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pal-it .lb mark{background:transparent;color:var(--accent-text);font-weight:650}
.pal-it .ht{font-size:12px;color:var(--text-4);white-space:nowrap}
.pal-it.on{background:var(--accent-soft)}
.pal-it.on .i{color:var(--accent-text)}
.pal-foot{display:flex;gap:14px;padding:8px 14px;border-top:1px solid var(--border);font-size:11.5px;color:var(--text-3);background:var(--surface-2)}
.pal-foot span{display:inline-flex;align-items:center;gap:5px}
.keys{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 28px}
.keys div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-2)}
.keys .kk{display:flex;gap:3px}
.keys h4{grid-column:1/-1;margin:12px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-4);font-weight:600}
.keys h4:first-child{margin-top:0}
.menu{position:fixed;z-index:90;min-width:200px;max-width:320px;max-height:360px;overflow:auto;background:var(--surface);border:1px solid var(--border-2);border-radius:10px;box-shadow:var(--shadow-lg);padding:6px;animation:fade 120ms var(--ease)}
.menu-h{font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.05em;padding:6px 8px 4px}
.menu-it{display:flex;align-items:center;gap:8px;width:100%;padding:0 8px;height:30px;border-radius:6px;text-align:left;font-size:13px;color:var(--text)}
.menu-it:hover{background:var(--hover)}
.menu-it .i{width:14px;height:14px;color:var(--text-3)}
.menu-it small{margin-left:auto;color:var(--text-4);font-size:11px;font-family:var(--mono)}
.menu-sep{height:1px;background:var(--border);margin:5px 2px}
.menu-form{display:flex;flex-direction:column;gap:8px;padding:6px}
.menu-form label{font-size:11.5px;font-weight:600;color:var(--text-3)}

/* ── Toasts ────────────────────────────────────────────── */
.toasts{position:fixed;right:16px;bottom:16px;z-index:100;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}
.toast{display:flex;align-items:center;gap:10px;min-width:240px;max-width:400px;padding:10px 14px;border-radius:10px;background:var(--surface);border:1px solid var(--border-2);box-shadow:var(--shadow-lg);font-size:13px;color:var(--text);pointer-events:auto;opacity:0;transform:translateY(8px);transition:opacity 180ms var(--ease),transform 180ms var(--ease)}
.toast.show{opacity:1;transform:none}
.toast .i{width:16px;height:16px}
.toast.success .i{color:var(--ok)}.toast.error .i{color:var(--err)}.toast.warn .i{color:var(--warn)}.toast.info .i{color:var(--accent-text)}
.toast span{flex:1;min-width:0;word-break:break-word}

/* ── Intent ──────────────────────────────────────────── */
.intent-tbl td{vertical-align:top}
.intent-detail{min-width:220px;max-width:520px;white-space:normal;word-break:break-word;color:var(--text-2)}
.intent-bad{color:var(--err);font-weight:600}
.stat.intent-warn{border-color:var(--err-border)}
.stat.intent-warn .stat-ico{background:var(--err-soft);color:var(--err)}
.stat.intent-warn::before{content:"";position:absolute;left:0;top:0;right:0;height:2px;background:var(--brand-grad)}

/* ── Responsive ────────────────────────────────────────── */
.mobile-back{display:none !important}
@media (max-width:1180px){
  .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .exp-grid{grid-template-columns:minmax(0,1fr)}
  .rt-body{grid-template-columns:minmax(0,1fr)}
  .rt-compose{border-right:0;border-bottom:1px solid var(--border)}
}
@media (max-width:1000px){
  .ov-grid{grid-template-columns:minmax(0,1fr)}
  .pane-l{width:250px}
  .tb-search{width:200px}
}
@media (max-width:767px){
  .app,html.sb-collapsed .app{grid-template-columns:minmax(0,1fr)}
  .sb{position:fixed;top:0;bottom:0;left:0;width:272px;transform:translateX(-100%);visibility:hidden;transition:transform 200ms var(--ease),visibility 0s linear 200ms;z-index:70}
  html.sb-open .sb{transform:none;visibility:visible;box-shadow:var(--shadow-lg);transition:transform 200ms var(--ease)}
  html.sb-open .backdrop{display:block;position:fixed;inset:0;background:var(--overlay);z-index:60;animation:fade var(--t) var(--ease)}
  html.sb-collapsed .sb-titles,html.sb-collapsed .nav-label,html.sb-collapsed .nav-count,html.sb-collapsed .sb-sec,html.sb-collapsed .conn-text,html.sb-collapsed .conn-url{display:revert}
  html.sb-collapsed .nav-item{justify-content:flex-start;padding:0 10px}
  html.sb-collapsed .sb-head{justify-content:flex-start;padding:0 12px 0 14px}
  html.sb-collapsed .sb-foot{align-items:stretch}
  .sb-collapse,.icon-btn.sb-expand,html.sb-collapsed .icon-btn.sb-expand{display:none}
  .icon-btn.tb-menu{display:inline-grid}
  .topbar{padding:0 8px 0 6px;gap:4px}
  .tb-search{width:auto;padding:0 8px;border:0;background:transparent}
  .tb-search span,.tb-search .kbd{display:none}
  .crumbs .crumb-root{display:none}
  .crumbs .sep:first-of-type{display:none}
  .view.page{padding:18px 16px 40px}
  .ph h1{font-size:19px}
  .stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .stat{padding:12px}
  .stat-val{font-size:22px}
  .quick{grid-template-columns:minmax(0,1fr)}
  .view.full{flex-direction:column;overflow:auto}
  .pane-l,.pane-l.narrow{width:auto;border-right:0;border-bottom:1px solid var(--border);max-height:42vh;flex-shrink:0}
  .pane-l.collapsible-sel{display:none}
  .view.full.has-sel .pane-l.collapsible-sel{display:none}
  .view.full:not(.has-sel) .pane-l.collapsible-sel{display:flex;max-height:none;flex:1}
  .view.full:not(.has-sel) .workspace.collapsible-ws{display:none}
  .mobile-back{display:inline-flex !important}
  .workspace{min-height:auto;flex:none}
  .view.full .workspace{flex:1 0 auto}
  .grid-wrap{min-height:360px;max-height:70vh}
  .rb{padding:16px}
  .param-row{grid-template-columns:minmax(0,1fr)}
  .kv-row,.kv-head{grid-template-columns:22px minmax(0,1fr) minmax(0,1fr) 28px}
  .toolbar .search{width:100%;order:-1}
  .db-head{padding:12px 16px 0}
  .db-title .badge,.db-title > .i{display:none}
  .db-head .mobile-back span{display:none}
  .rel-grid,.qr-grid{grid-template-columns:minmax(0,1fr)}
  .keys{grid-template-columns:minmax(0,1fr)}
  .er{min-height:calc(100vh - var(--tb-h))}
  .sql-main{min-height:calc(100vh - var(--tb-h))}
  .modal{top:6vh}
  .toasts{left:16px;right:16px;align-items:stretch}
  .toast{max-width:none}
  .pager{margin-left:0}
  .gfoot .ps{display:none}
  .sql-bar .badge{display:none}
  .sql-bar{gap:4px;padding:8px}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms !important;transition-duration:1ms !important}}
`
