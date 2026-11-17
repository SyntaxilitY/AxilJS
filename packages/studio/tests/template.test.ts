import { describe, it, expect } from 'vitest';
import { generateHTML, STUDIO_VIEWS } from '../src/ui/template';
import { LOGO_MARK_32, LOGO_MARK_64 } from '../src/ui/brand';

const base = { appName: 'shop-api', appUrl: 'http://localhost:4799', studioPort: 4800, qrDataUrl: '' };
const html = generateHTML(base);

function inlineScripts(doc: string): string[] {
  return [...doc.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
}

describe('studio template', () => {
  it('registers every view with a nav entry and a client renderer', () => {
    expect(STUDIO_VIEWS).toEqual(['overview', 'endpoints', 'database', 'schema', 'sql', 'realtime', 'intent', 'export', 'qr']);
    for (const view of STUDIO_VIEWS) {
      expect(html, view).toContain(`data-view="${view}"`);
      expect(html, view).toContain(`href="#/${view}"`);
      expect(html, view).toContain(`defineView("${view}"`);
    }
    for (const id of ['id="content"', 'id="crumbs"', 'id="toasts"', 'id="palette-btn"', 'id="theme-btn"', 'id="refresh-btn"', 'id="studio-boot"']) {
      expect(html).toContain(id);
    }
  });

  it('inline scripts are syntactically valid JavaScript', () => {
    const scripts = inlineScripts(html);
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    for (const s of scripts) {
      if (s.trim().startsWith('{')) JSON.parse(s); // the boot data block
      else expect(() => new Function(s)).not.toThrow();
    }
  });

  it('escapes a malicious app name everywhere', () => {
    const evil = '<img src=x onerror=alert(1)></script><script>alert(2)</script>';
    const doc = generateHTML({ ...base, appName: evil });
    expect(doc).not.toContain('<img src=x');
    expect(doc).not.toContain('<script>alert(2)');
    expect(doc).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // The boot JSON keeps the raw value but cannot break out of its <script>
    const boot = /<script type="application\/json" id="studio-boot">([\s\S]*?)<\/script>/.exec(doc)![1];
    expect(boot).not.toMatch(/[<>]/);
    expect(JSON.parse(boot).appName).toBe(evil);
  });

  it('does not turn a hostile app URL into markup or a javascript: link', () => {
    const doc = generateHTML({ ...base, appUrl: 'javascript:alert(1)//"><svg onload=alert(1)>' });
    expect(doc).not.toContain('<svg onload');
    expect(doc).not.toMatch(/href="javascript:/i);
  });

  it('only accepts image data URIs for the QR code', () => {
    const doc = generateHTML({ ...base, qrDataUrl: '"><script>alert(1)</script>' });
    expect(doc).not.toContain('<script>alert(1)');
    const ok = generateHTML({ ...base, qrDataUrl: 'data:image/png;base64,AAAA' });
    expect(ok).toContain('data:image/png;base64,AAAA');
  });

  it('is self-contained: no external scripts, styles, fonts or images', () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
    expect(html).not.toMatch(/@import|url\(\s*['"]?https?:/i);
    expect(html).not.toMatch(/fonts\.googleapis|cdn\.|unpkg|jsdelivr/i);
    const attrs = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map(m => m[1]);
    for (const v of attrs) {
      const ok = v.startsWith('#') || v.startsWith('data:image/png;base64,') || v === base.appUrl;
      expect(ok, v).toBe(true);
    }
  });

  it('embeds the brand favicon and sidebar logo as data URIs', () => {
    expect(LOGO_MARK_32).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    expect(LOGO_MARK_64).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    expect(html).toContain(`<link rel="icon" type="image/png" href="${LOGO_MARK_32}">`);
    expect(html).toContain(`<img src="${LOGO_MARK_64}"`);
  });

  it('supports light and dark themes with a ?theme= override', () => {
    expect(html).toContain('html[data-theme="light"]');
    expect(html).toContain('html[data-theme="dark"]');
    expect(html).toContain('theme=(light|dark)');
  });

  it('client code never builds markup from data via inline handlers', () => {
    const client = inlineScripts(html).find(s => s.includes('defineView('))!;
    expect(client).not.toMatch(/\son[a-z]+=["']/i); // no onclick="…" strings
    expect(client).not.toMatch(/\.innerHTML\s*=(?!\s*ICONS\[)/); // innerHTML only for the static icon map
  });
});
