import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

vi.mock('../src/digest/read.js', () => ({ readNight: vi.fn() }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };
const read = vi.mocked(readNight);

const night: Night = {
  night: '2026-10-28',
  badLines: 1,
  counts: { ok: 1, retry: 3, fail: 1 },
  rows: [
    {
      job: 'backup',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T01:00:00+01:00',
      lastAt: '2026-10-28T01:00:00+01:00',
    },
    {
      job: 'sync',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'timeout',
      firstAt: '2026-10-28T02:00:00+01:00',
      lastAt: '2026-10-28T02:30:00+01:00',
    },
    {
      job: 'zip',
      owner: 'mia',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'disk full',
      firstAt: '2026-10-28T03:00:00+01:00',
      lastAt: '2026-10-28T03:00:00+01:00',
    },
  ],
};

const get = (path: string) => createApp(config).request(path);

describe('digest page', () => {
  beforeEach(() => {
    read.mockReset();
    process.env.LANE_MARKER = 'TEST-MARKER';
  });

  it('renders rows, marks warn rows, dashes missing data, keeps offsets', async () => {
    read.mockReturnValue(night);
    const res = await get('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(read).toHaveBeenCalledWith('runs', '2026-10-28');
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<h1>digest · 2026-10-28</h1>');
    expect(html.match(/<tr class="warn">/g)).toHaveLength(2);
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('2026-10-28T02:30:00+01:00');
    expect(html).toContain('<p class="warn">bad lines: 1</p>');
    expect(html.indexOf('backup')).toBeLessThan(html.indexOf('sync'));
  });

  it('says nothing ran for an empty night', async () => {
    read.mockReturnValue({ night: '2026-10-27', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    const res = await get('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('404s a night with no file', async () => {
    read.mockReturnValue(null);
    const res = await get('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-01-01');
  });

  it('404s an invalid night without reading', async () => {
    const res = await get('/digest/nope');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for nope');
    expect(read).not.toHaveBeenCalled();
  });
});
