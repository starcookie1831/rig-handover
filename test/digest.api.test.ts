import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

vi.mock('../src/digest/read.js', () => ({ readNight: vi.fn() }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const night: Night = {
  night: '2026-10-28',
  rows: [
    { job: 'backup', owner: null, runs: 2, retries: 1, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T01:05:00+01:00' },
    { job: 'index', owner: 'rook', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'boom', firstAt: '2026-10-28T02:00:00+01:00', lastAt: '2026-10-28T02:00:00+01:00' },
  ],
  badLines: 1,
  counts: { ok: 1, retry: 1, fail: 1 },
};

describe('GET /api/digest/:night', () => {
  beforeEach(() => vi.mocked(readNight).mockReset());

  it('returns the Night unchanged', async () => {
    vi.mocked(readNight).mockReturnValue(night);
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(night);
    expect(readNight).toHaveBeenCalledWith('runs', '2026-10-28');
  });

  it('404s a night with no file', async () => {
    vi.mocked(readNight).mockReturnValue(null);
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-01-01' });
  });

  it('404s an invalid night without reading', async () => {
    const res = await createApp(config).request('/api/digest/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: 'nope' });
    expect(readNight).not.toHaveBeenCalled();
  });
});
