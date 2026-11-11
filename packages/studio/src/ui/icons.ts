/**
 * Axil Studio — inline SVG icon set (stroke based, currentColor).
 *
 * Static, trusted markup only. The same map is shipped to the browser (inside
 * the boot JSON) so the client can render icons without any network request.
 */

const PATHS: Record<string, string> = {
  overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  endpoints: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v3a4 4 0 0 0 4 4h5.5"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.38 3.36 2.5 7.5 2.5s7.5-1.12 7.5-2.5v-13"/><path d="M4.5 12c0 1.38 3.36 2.5 7.5 2.5s7.5-1.12 7.5-2.5"/>',
  schema: '<rect x="3" y="3.5" width="7" height="5" rx="1.2"/><rect x="14" y="15.5" width="7" height="5" rx="1.2"/><rect x="14" y="3.5" width="7" height="5" rx="1.2"/><path d="M10 6h4"/><path d="M6.5 8.5v6.5a3 3 0 0 0 3 3H14"/>',
  sql: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/><path d="M13 15h4"/>',
  realtime: '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M8.3 8.3a5 5 0 0 0 0 7.4"/><path d="M15.7 8.3a5 5 0 0 1 0 7.4"/><path d="M5.3 5.3a9.5 9.5 0 0 0 0 13.4"/><path d="M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
  export: '<path d="M3.5 8 12 3.5 20.5 8 12 12.5Z"/><path d="M3.5 8v8L12 20.5 20.5 16V8"/><path d="M12 12.5v8"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20.5 14v2"/><path d="M14 20.5h3"/><path d="M20.5 20.5h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4.5h6V7"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  filter: '<path d="M3.5 5h17l-6.5 8v5.5l-4 2V13Z"/>',
  columns: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9.5 4v16M14.5 4v16"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2"/>',
  play: '<path d="M7 4.5 19 12 7 19.5Z" fill="currentColor"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3 14.5 21 10 14 3 9.5Z"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5"/><path d="m16 7 2.5 2.5"/><path d="m18.5 4.5 2 2"/>',
  table: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 9.5V20"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  sort: '<path d="m7 9 5-5 5 5"/><path d="m7 15 5 5 5-5"/>',
  alert: '<path d="M12 3.5 2.5 20h19Z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.5h.01"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  success: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 8v4.5l3 2"/>',
  bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7 14h10"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
  eraser: '<path d="m7 20-3.5-3.5a1.5 1.5 0 0 1 0-2.1L13.6 4.3a1.5 1.5 0 0 1 2.1 0l4 4a1.5 1.5 0 0 1 0 2.1L10.5 20Z"/><path d="M20 20H10.5"/><path d="m8.5 9.5 6 6"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  plug: '<path d="M9 3.5v5M15 3.5v5"/><path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0Z"/><path d="M12 17v3.5"/>',
  file: '<path d="M7 3.5h7L18.5 8v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 13h7M8.5 16.5h7"/>',
  code: '<path d="m8.5 7-5 5 5 5"/><path d="m15.5 7 5 5-5 5"/>',
  braces: '<path d="M8 4H7a2 2 0 0 0-2 2v3.5a2 2 0 0 1-2 2v1a2 2 0 0 1 2 2V18a2 2 0 0 0 2 2h1"/><path d="M16 4h1a2 2 0 0 1 2 2v3.5a2 2 0 0 0 2 2v1a2 2 0 0 0-2 2V18a2 2 0 0 1-2 2h-1"/>',
  fit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9"/><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9"/><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/><path d="M11 8.5v5M8.5 11h5"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/><path d="M8.5 11h5"/>',
  more: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
  wand: '<path d="m4 20 11-11"/><path d="m13 7 4 4"/><path d="M18 3v3M16.5 4.5h3M20 9v2M19 10h2M10 3v2M9 4h2"/>',
  postman: '<circle cx="12" cy="12" r="8.5"/><path d="m8 15.5 6.5-6.5"/><path d="M14.5 9H11"/><path d="M14.5 9v3.5"/>',
  insomnia: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
  openapi: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z"/><path d="M9.5 12h5"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z"/>',
  layers: '<path d="m12 3.5 8.5 4.5L12 12.5 3.5 8Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
  rows: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 15h17"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M5 3.5h11.5L20.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z"/><path d="M7.5 3.5v5h8v-5"/><path d="M7.5 20.5v-6h9v6"/>',
  insert: '<path d="M4 12h11"/><path d="m11 8 4 4-4 4"/><path d="M20 4v16"/>'
}

/** Returns an SVG string for a named icon (empty string for unknown names). */
export function icon(name: string, size = 16, cls = ''): string {
  const body = PATHS[name]
  if (!body) return ''
  const klass = cls ? `i ${cls}` : 'i'
  return `<svg class="${klass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
}

/** The raw path map, shipped to the client so it can build icons on demand. */
export function iconPaths(): Record<string, string> {
  return { ...PATHS }
}
