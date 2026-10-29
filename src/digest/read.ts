import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, Status } from './types.js';

type Line = { at: string; job: string; status: Status; owner: string | null; error: string | null };

const statuses: readonly Status[] = ['ok', 'retry', 'fail'];

function isStatus(v: unknown): v is Status {
  return typeof v === 'string' && (statuses as readonly string[]).includes(v);
}

// null when the line isn't JSON or lacks a string `at`, a string `job` and a known `status`.
function parseLine(text: string): Line | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || !isStatus(o.status)) return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status,
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, DigestRow>();
  const counts: Record<Status, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  // The log is chronological: file order decides first, last and "last line that had one".
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const row = byJob.get(line.job);
    if (!row) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    if (line.error !== null) row.lastError = line.error;
    row.lastAt = line.at;
  }

  // Plain code-unit order, not localeCompare: the page and the JSON must agree on every machine.
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
};
