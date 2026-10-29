import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Real reader, temp runs dir: runs/ is read-only.
const full = '2026-10-20';
const empty = '2026-10-21';
const missing = '2026-10-22';

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const log = [
  line({ at: '2026-10-20T01:00:00+01:00', job: 'backup', status: 'retry', owner: 'sam', error: 'timeout' }),
  line({ at: '2026-10-20T01:05:00+01:00', job: 'backup', status: 'retry', owner: 'sam', error: 'timeout' }),
  line({ at: '2026-10-20T01:10:00+01:00', job: 'backup', status: 'retry', owner: 'sam', error: 'timeout' }),
  line({ at: '2026-10-20T01:15:00+01:00', job: 'backup', status: 'ok', owner: 'sam' }),
  line({ at: '2026-10-20T02:00:00+01:00', job: 'cleanup', status: 'ok', owner: null }),
  'this is not json',
  line({ at: '2026-10-20T03:00:00+01:00', job: 'sync', status: 'fail', owner: 'ana', error: 'disk full' }),
].join('\n');

let dir: string;
let config: Parameters<typeof createApp>[0];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-'));
  writeFileSync(join(dir, `${full}.jsonl`), log + '\n');
  writeFileSync(join(dir, `${empty}.jsonl`), '');
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const page = (night: string) => createApp(config).request(`/digest/${night}`);
const api = (night: string) => createApp(config).request(`/api/digest/${night}`);

// Body rows of the page's table: the opening <tr> tag and the cell texts, header row skipped.
function tableRows(html: string) {
  return [...html.matchAll(/<tr([^>]*)>(.*?)<\/tr>/gs)]
    .filter((m) => !m[2].includes('<th'))
    .map((m) => ({
      tag: m[1],
      cells: [...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((c) => c[1]),
    }));
}

describe('digest page', () => {
  it('200 for a night with a file, with the lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await page(full);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${full}`);
    expect(html).toContain('TEST-MARKER');
  });

  it('404 for a night with no file', async () => {
    const res = await page(missing);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no run log for ${missing}`);
  });

  it('empty night says nothing ran', async () => {
    const res = await page(empty);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('a bad line still renders and is counted', async () => {
    const res = await page(full);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('bad lines: 1');
    expect(tableRows(html)).toHaveLength(3);
  });

  it('marks 3+ retries and fail rows as warn, and null owner as —', async () => {
    const rows = tableRows(await (await page(full)).text());
    const byJob = (job: string) => rows.find((r) => r.cells[0] === job);
    expect(byJob('backup')?.tag).toContain('class="warn"');
    expect(byJob('sync')?.tag).toContain('class="warn"');
    expect(byJob('cleanup')?.tag).not.toContain('class="warn"');
    expect(byJob('cleanup')?.cells[1]).toBe('—');
  });
});

describe('digest json', () => {
  it('200 with the night as the reader returned it', async () => {
    const res = await api(full);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe(full);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['backup', 'cleanup', 'sync']);
    expect(body.rows.find((r) => r.job === 'cleanup')?.owner).toBeNull();
  });

  it('404 with an error body for a night with no file', async () => {
    const res = await api(missing);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: missing });
  });

  it('empty night has no rows', async () => {
    const res = await api(empty);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Night).rows).toEqual([]);
  });
});

describe('page and json agree', () => {
  it('same jobs in the same order', async () => {
    const body = (await (await api(full)).json()) as Night;
    const rows = tableRows(await (await page(full)).text());
    expect(rows.map((r) => r.cells[0])).toEqual(body.rows.map((r) => r.job));
  });
});
