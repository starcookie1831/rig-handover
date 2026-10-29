import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

// readNight is a stub on main (#2); mock it so the board runs against the real runs/ dir.
vi.mock('../src/digest/read.js', () => ({ readNight: vi.fn() }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const night = (n: string): Night => ({ night: n, rows: [], badLines: 0, counts: { ok: 10, retry: 4, fail: 1 } });

beforeEach(() => {
  vi.mocked(readNight).mockImplementation((_dir, n) => night(n));
});

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest with its counts', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
    expect(html).toContain('</a> <span class="mute">ok 10 · retry 4 · fail 1</span>');
  });

  it('keeps the link, without counts, for a night with no log', async () => {
    vi.mocked(readNight).mockReturnValue(null);
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).not.toContain('ok 10');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});