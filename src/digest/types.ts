// Plan morning-digest § 1. The contract for every part of § 2: change it only with them.

export type Status = 'ok' | 'retry' | 'fail';

// One row per job in runs/<night>.jsonl.
export type DigestRow = {
  job: string;
  // From the job's last line. null renders as `—`.
  owner: string | null;
  // Every line for the job, whatever its status.
  runs: number;
  // Lines with status `retry`.
  retries: number;
  lastStatus: Status;
  // `error` of the job's last line that had one; null if none did.
  lastError: string | null;
  // `at` as written in the log, offset kept. Never converted to UTC.
  firstAt: string;
  lastAt: string;
};

export type Night = {
  // YYYY-MM-DD, as in the file name.
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse. Counted, never thrown.
  badLines: number;
  // Per log line, not per job.
  counts: Record<Status, number>;
};

// null when runs/<night>.jsonl does not exist. An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
