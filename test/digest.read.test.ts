import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has one row per job, sorted by job', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts the truncated last line as bad and per-line statuses over the night', () => {
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('folds each job into one row', () => {
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
    expect(row('digest/render')).toMatchObject({ owner: null, lastError: null });
    expect(row('lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);
  const line = (o: Record<string, unknown>) => JSON.stringify(o);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the file does not exist', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('rethrows fs errors other than a missing file', () => {
    mkdirSync(join(dir, '2026-01-01.jsonl'));
    expect(() => readNight(dir, '2026-01-01')).toThrow();
  });

  it('reads an empty file as a night with no rows', () => {
    write('2026-01-01', '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('skips blank lines and a trailing newline without counting them', () => {
    write('2026-01-01', `\n${line({ at: 't1', job: 'a', status: 'ok', owner: 'x' })}\r\n  \n\n`);
    const n = readNight(dir, '2026-01-01');
    expect(n?.badLines).toBe(0);
    expect(n?.rows).toHaveLength(1);
  });

  it('counts lines that are not JSON or miss at, job or a known status', () => {
    write(
      '2026-01-01',
      [
        '{nope',
        '42',
        'null',
        '[]',
        line({ job: 'a', status: 'ok' }),
        line({ at: 1, job: 'a', status: 'ok' }),
        line({ at: 't', status: 'ok' }),
        line({ at: 't', job: 'a', status: 'skipped' }),
        line({ at: 't', job: 'a', status: 'ok' }),
      ].join('\n'),
    );
    const n = readNight(dir, '2026-01-01');
    expect(n?.badLines).toBe(8);
    expect(n?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(n?.rows.map((r) => r.job)).toEqual(['a']);
  });

  it('takes owner from the last line, null or missing kept as null', () => {
    write(
      '2026-01-01',
      [
        line({ at: 't1', job: 'a', status: 'ok', owner: 'x' }),
        line({ at: 't2', job: 'a', status: 'ok', owner: null }),
        line({ at: 't1', job: 'b', status: 'ok', owner: null }),
        line({ at: 't2', job: 'b', status: 'ok', owner: 'y' }),
        line({ at: 't1', job: 'c', status: 'ok' }),
      ].join('\n'),
    );
    const owners = readNight(dir, '2026-01-01')?.rows.map((r) => [r.job, r.owner]);
    expect(owners).toEqual([
      ['a', null],
      ['b', 'y'],
      ['c', null],
    ]);
  });

  it('keeps the last error that was set, and first/last at in file order', () => {
    write(
      '2026-01-01',
      [
        line({ at: '2026-01-01T23:00:00+01:00', job: 'a', status: 'retry', error: 'one' }),
        line({ at: '2026-01-01T22:00:00Z', job: 'a', status: 'retry', error: 'two' }),
        line({ at: '2026-01-02T01:00:00+01:00', job: 'a', status: 'fail' }),
      ].join('\n'),
    );
    expect(readNight(dir, '2026-01-01')?.rows[0]).toMatchObject({
      runs: 3,
      retries: 2,
      lastStatus: 'fail',
      lastError: 'two',
      firstAt: '2026-01-01T23:00:00+01:00',
      lastAt: '2026-01-02T01:00:00+01:00',
    });
  });

  it('sorts by plain string order, not locale', () => {
    write('2026-01-01', ['b', 'a', 'B', '_'].map((job) => line({ at: 't', job, status: 'ok' })).join('\n'));
    expect(readNight(dir, '2026-01-01')?.rows.map((r) => r.job)).toEqual(['B', '_', 'a', 'b']);
  });
});
