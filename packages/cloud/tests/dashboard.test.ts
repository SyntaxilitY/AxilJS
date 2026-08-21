import { describe, it, expect, vi } from 'vitest';
import { createDashboard } from '../src/dashboard';
import type { axilRequest, axilResponse } from '@axiljs/common';

describe('Monitoring Dashboard', () => {
  it('escapes dynamic user-defined properties to prevent XSS', () => {
    const handler = createDashboard({
      title: '<script>alert("xss")</script>Dashboard',
      metricsEndpoint: '/custom"metrics',
    });

    let renderedHtml = '';
    const req = {} as unknown as axilRequest;
    const res = {
      raw: { setHeader: vi.fn() },
      html: (html: string) => {
        renderedHtml = html;
      },
    } as unknown as axilResponse;

    handler(req, res);

    expect(renderedHtml).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Dashboard');
    expect(renderedHtml).not.toContain('<script>alert("xss")</script>');
    expect(res.raw.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("default-src 'self'")
    );
  });
});