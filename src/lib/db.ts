import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || "./clawork.db";
const resolvedPath = path.resolve(process.cwd(), dbPath);

if (!fs.existsSync(path.dirname(resolvedPath))) {
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
}

const db = new Database(resolvedPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    chain TEXT NOT NULL,
    poster_wallet TEXT,
    master_wallet TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    response TEXT NOT NULL,
    agent_wallet TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );
`);

export type JobRecord = {
  id: number;
  description: string;
  amount: number;
  chain: string;
  poster_wallet: string | null;
  master_wallet: string;
  status: string;
  created_at: string;
};

export type SubmissionRecord = {
  id: number;
  job_id: number;
  response: string;
  agent_wallet: string;
  status: string;
  created_at: string;
};

export function createJob(params: {
  description: string;
  amount: number;
  chain: string;
  posterWallet?: string | null;
  masterWallet: string;
}) {
  const stmt = db.prepare(
    `INSERT INTO jobs (description, amount, chain, poster_wallet, master_wallet, status, created_at)
     VALUES (@description, @amount, @chain, @poster_wallet, @master_wallet, 'open', @created_at)`
  );

  const createdAt = new Date().toISOString();
  const info = stmt.run({
    description: params.description,
    amount: params.amount,
    chain: params.chain,
    poster_wallet: params.posterWallet ?? null,
    master_wallet: params.masterWallet,
    created_at: createdAt
  });

  return {
    id: Number(info.lastInsertRowid),
    created_at: createdAt
  };
}

export function listJobs(status?: string) {
  if (status) {
    return db
      .prepare("SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC")
      .all(status) as JobRecord[];
  }

  return db
    .prepare("SELECT * FROM jobs ORDER BY created_at DESC")
    .all() as JobRecord[];
}

export function getJob(id: number) {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRecord | undefined;
}

export function createSubmission(params: {
  jobId: number;
  response: string;
  agentWallet: string;
}) {
  const stmt = db.prepare(
    `INSERT INTO submissions (job_id, response, agent_wallet, status, created_at)
     VALUES (@job_id, @response, @agent_wallet, 'submitted', @created_at)`
  );

  const createdAt = new Date().toISOString();
  const info = stmt.run({
    job_id: params.jobId,
    response: params.response,
    agent_wallet: params.agentWallet,
    created_at: createdAt
  });

  return {
    id: Number(info.lastInsertRowid),
    created_at: createdAt
  };
}

export function listSubmissions(jobId: number) {
  return db
    .prepare("SELECT * FROM submissions WHERE job_id = ? ORDER BY created_at DESC")
    .all(jobId) as SubmissionRecord[];
}

export default db;
