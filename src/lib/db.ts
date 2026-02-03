import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

let db: Database.Database;

// Initialize database based on environment
if (process.env.TURSO_DB_URL && process.env.TURSO_DB_AUTH_TOKEN) {
  // Use Turso HTTP API directly (production/serverless)
  // Note: For serverless, we use Turso's HTTP API which requires async operations
  // However, since Next.js API routes are async, this works fine
  // We'll use better-sqlite3 for local dev, and Turso HTTP for production
  
  // In serverless (Vercel), use Turso HTTP API directly
  // For now, fall back to local SQLite in serverless and use Turso HTTP in API routes
  // This is a simplified approach - for full Turso support, API routes should use async Turso client
  
  // For build time and serverless, create a minimal SQLite file that will be replaced
  // The actual Turso connection will be made via HTTP in API routes if needed
  const dbPath = process.env.DATABASE_PATH || "./clawork.db";
  const resolvedPath = path.resolve(process.cwd(), dbPath);
  
  if (!fs.existsSync(path.dirname(resolvedPath))) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }
  
  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  
  // Note: In production, API routes should use Turso HTTP client directly
  // This local DB is just for schema initialization during build
  
} else {
  // Use local SQLite file (development)
  const dbPath = process.env.DATABASE_PATH || "./clawork.db";
  const resolvedPath = path.resolve(process.cwd(), dbPath);

  if (!fs.existsSync(path.dirname(resolvedPath))) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    private_id TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    chain TEXT NOT NULL,
    poster_wallet TEXT,
    master_wallet TEXT NOT NULL,
    job_wallet TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    response TEXT NOT NULL,
    agent_wallet TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    rating_deadline TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    amount REAL NOT NULL,
    chain TEXT NOT NULL,
    transaction_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    balance REAL NOT NULL DEFAULT 0.0,
    pending_balance REAL NOT NULL DEFAULT 0.0,
    verified_balance REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    UNIQUE(wallet_address, chain)
  );

  CREATE TABLE IF NOT EXISTS poster_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    poster_wallet TEXT NOT NULL,
    job_amount REAL NOT NULL,
    collateral_amount REAL NOT NULL DEFAULT 0.001,
    total_paid REAL NOT NULL,
    transaction_hash TEXT,
    collateral_returned BOOLEAN NOT NULL DEFAULT 0,
    returned_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    amount REAL NOT NULL,
    chain TEXT NOT NULL,
    destination_wallet TEXT,
    transaction_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
`);

// Add rating column to submissions table if it doesn't exist (migration)
try {
  db.exec(`ALTER TABLE submissions ADD COLUMN rating INTEGER`);
} catch (error: any) {
  // Column already exists, ignore error
  if (!error.message.includes("duplicate column")) {
    throw error;
  }
}

// Add balance columns to deposits table if they don't exist (migration)
try {
  db.exec(`ALTER TABLE deposits ADD COLUMN balance REAL DEFAULT 0.0`);
  db.exec(`UPDATE deposits SET balance = amount WHERE balance = 0.0 OR balance IS NULL`);
} catch (error: any) {
  if (!error.message.includes("duplicate column")) {
    throw error;
  }
}

try {
  db.exec(`ALTER TABLE deposits ADD COLUMN pending_balance REAL DEFAULT 0.0`);
  db.exec(`ALTER TABLE deposits ADD COLUMN verified_balance REAL DEFAULT 0.0`);
} catch (error: any) {
  if (!error.message.includes("duplicate column")) {
    throw error;
  }
}

// Add job_wallet column to jobs table if it doesn't exist (migration)
try {
  const masterWallet = process.env.MASTER_WALLET_ADDRESS || "";
  db.exec(`ALTER TABLE jobs ADD COLUMN job_wallet TEXT`);
  if (masterWallet) {
    db.prepare(`UPDATE jobs SET job_wallet = ? WHERE job_wallet IS NULL`).run(masterWallet);
  }
} catch (error: any) {
  if (!error.message.includes("duplicate column")) {
    throw error;
  }
}

// Agents (MoltyBounty ID) and agent_wallets
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username_lower TEXT NOT NULL UNIQUE,
    username_display TEXT NOT NULL,
    private_key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_username_lower ON agents(username_lower);
  CREATE TABLE IF NOT EXISTS agent_wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(wallet_address, chain),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_wallets_wallet_chain ON agent_wallets(wallet_address, chain);
`);

try {
  db.exec(`ALTER TABLE jobs ADD COLUMN poster_username TEXT`);
} catch (error: any) {
  if (!error.message?.includes("duplicate column")) throw error;
}
try {
  db.exec(`ALTER TABLE submissions ADD COLUMN agent_username TEXT`);
} catch (error: any) {
  if (!error.message?.includes("duplicate column")) throw error;
}
try {
  db.exec(`ALTER TABLE agents ADD COLUMN description TEXT`);
} catch (error: any) {
  if (!error.message?.includes("duplicate column")) throw error;
}

// Add rating_deadline column to submissions table if it doesn't exist (migration)
try {
  db.exec(`ALTER TABLE submissions ADD COLUMN rating_deadline TEXT`);
  // Set deadline for existing submissions (24 hours from created_at)
  const submissions = db.prepare("SELECT id, created_at FROM submissions WHERE rating_deadline IS NULL").all() as { id: number; created_at: string }[];
  const updateStmt = db.prepare("UPDATE submissions SET rating_deadline = ? WHERE id = ?");
  for (const sub of submissions) {
    const deadline = new Date(new Date(sub.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
    updateStmt.run(deadline, sub.id);
  }
} catch (error: any) {
  if (!error.message.includes("duplicate column")) {
    throw error;
  }
}

// Add private_id column to jobs table if it doesn't exist (migration)
try {
  db.exec(`ALTER TABLE jobs ADD COLUMN private_id TEXT`);
  // Generate private_ids for existing jobs
  const existingJobs = db.prepare("SELECT id FROM jobs WHERE private_id IS NULL").all() as { id: number }[];
  const updateStmt = db.prepare("UPDATE jobs SET private_id = ? WHERE id = ?");
  for (const job of existingJobs) {
    const privateId = generatePrivateId();
    updateStmt.run(privateId, job.id);
  }
  // Create unique index
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_private_id ON jobs(private_id)`);
  } catch (e) {
    // Index might already exist, ignore
  }
} catch (error: any) {
  // Column already exists, ignore error
  if (!error.message.includes("duplicate column") && !error.message.includes("already exists")) {
    throw error;
  }
}

// Generate secure, non-guessable private ID (48 characters, URL-safe)
function generatePrivateId(): string {
  // Generate 36 random bytes (288 bits) and encode as base64url (URL-safe)
  const bytes = randomBytes(36);
  return bytes.toString("base64url");
}

export type JobRecord = {
  id: number;
  private_id: string;
  description: string;
  amount: number;
  chain: string;
  poster_wallet: string | null;
  poster_username?: string | null;
  master_wallet: string;
  job_wallet: string;
  status: string;
  created_at: string;
};

export type SubmissionRecord = {
  id: number;
  job_id: number;
  response: string;
  agent_wallet: string;
  agent_username?: string | null;
  status: string;
  rating: number | null;
  rating_deadline: string;
  created_at: string;
};

export type DepositRecord = {
  id: number;
  wallet_address: string;
  amount: number;
  chain: string;
  transaction_hash: string | null;
  status: string;
  balance: number;
  pending_balance: number;
  verified_balance: number;
  created_at: string;
};

// Check if using Turso
const usingTurso = !!(process.env.TURSO_DB_URL && process.env.TURSO_DB_AUTH_TOKEN);

// Lazy-load Turso module (required for Next.js bundler to resolve named exports)
let tursoModule: typeof import("./db-turso") | null = null;
async function getTurso() {
  if (!tursoModule) tursoModule = await import("./db-turso");
  return tursoModule;
}

// Initialize Turso schema lazily (on first use)
let tursoSchemaInitialized = false;
async function ensureTursoSchema() {
  if (usingTurso && !tursoSchemaInitialized && typeof window === "undefined") {
    tursoSchemaInitialized = true;
    try {
      const turso = await getTurso();
      await turso.initTursoSchema();
    } catch (err: any) {
      console.error("Failed to initialize Turso schema:", err);
    }
  }
}

// --- Agents (MoltyBounty ID) ---
export type AgentRecord = {
  id: number;
  username_lower: string;
  username_display: string;
  private_key_hash: string;
  description?: string | null;
  created_at: string;
};

export async function createAgent(params: {
  usernameLower: string;
  usernameDisplay: string;
  privateKeyHash: string;
  description?: string | null;
}): Promise<{ id: number; username_lower: string; username_display: string; created_at: string }> {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.createAgentTurso(params);
  }
  const createdAt = new Date().toISOString();
  const description = params.description ?? null;
  const info = db.prepare(
    `INSERT INTO agents (username_lower, username_display, private_key_hash, description, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(params.usernameLower, params.usernameDisplay, params.privateKeyHash, description, createdAt);
  return {
    id: Number(info.lastInsertRowid),
    username_lower: params.usernameLower,
    username_display: params.usernameDisplay,
    created_at: createdAt,
  };
}

export async function getAgentByUsername(usernameLower: string): Promise<AgentRecord | undefined> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getAgentByUsernameTurso(usernameLower);
  }
  return db.prepare("SELECT * FROM agents WHERE username_lower = ?").get(usernameLower) as AgentRecord | undefined;
}

export async function linkWallet(params: { agentId: number; walletAddress: string; chain: string }): Promise<void> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.linkWalletTurso(params);
  }
  const chain = params.chain.trim().toLowerCase();
  const wallet = params.walletAddress.trim();
  db.prepare("DELETE FROM agent_wallets WHERE agent_id = ? AND chain = ?").run(params.agentId, chain);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO agent_wallets (agent_id, wallet_address, chain, created_at) VALUES (?, ?, ?, ?)`
  ).run(params.agentId, wallet, chain, createdAt);
}

export async function getLinkedWallet(agentId: number, chain: string): Promise<{ wallet_address: string } | undefined> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getLinkedWalletTurso(agentId, chain);
  }
  const row = db
    .prepare("SELECT wallet_address FROM agent_wallets WHERE agent_id = ? AND chain = ?")
    .get(agentId, chain.trim().toLowerCase()) as { wallet_address: string } | undefined;
  return row;
}

export async function getAgentByWallet(walletAddress: string, chain: string): Promise<AgentRecord | undefined> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getAgentByWalletTurso(walletAddress, chain);
  }
  return db
    .prepare(
      `SELECT a.* FROM agents a JOIN agent_wallets w ON w.agent_id = a.id WHERE w.wallet_address = ? AND w.chain = ?`
    )
    .get(walletAddress.trim(), chain.trim().toLowerCase()) as AgentRecord | undefined;
}

export async function createJob(params: {
  description: string;
  amount: number;
  chain: string;
  posterWallet: string | null;
  posterUsername?: string | null;
  masterWallet: string;
  jobWallet: string;
  transactionHash?: string | null;
}) {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.createJobTurso(params);
  }
  const privateId = generatePrivateId();
  const isFreeTask = params.amount === 0;
  const collateralAmount = 0.001;
  const totalPaid = params.amount + collateralAmount;
  const posterUsername = params.posterUsername ?? null;

  const jobStmt = db.prepare(
    `INSERT INTO jobs (private_id, description, amount, chain, poster_wallet, poster_username, master_wallet, job_wallet, status, created_at)
     VALUES (@private_id, @description, @amount, @chain, @poster_wallet, @poster_username, @master_wallet, @job_wallet, 'open', @created_at)`
  );

  const createdAt = new Date().toISOString();
  const jobInfo = jobStmt.run({
    private_id: privateId,
    description: params.description,
    amount: params.amount,
    chain: params.chain,
    poster_wallet: params.posterWallet,
    poster_username: posterUsername,
    master_wallet: params.masterWallet,
    job_wallet: params.jobWallet,
    created_at: createdAt
  });

  const jobId = Number(jobInfo.lastInsertRowid);
  
  // Record the poster's payment only for paid jobs (free tasks have no poster payment)
  if (!isFreeTask && params.posterWallet) {
    const paymentStmt = db.prepare(
      `INSERT INTO poster_payments (job_id, poster_wallet, job_amount, collateral_amount, total_paid, transaction_hash, created_at)
       VALUES (@job_id, @poster_wallet, @job_amount, @collateral_amount, @total_paid, @transaction_hash, @created_at)`
    );
    paymentStmt.run({
      job_id: jobId,
      poster_wallet: params.posterWallet,
      job_amount: params.amount,
      collateral_amount: collateralAmount,
      total_paid: totalPaid,
      transaction_hash: params.transactionHash ?? null,
      created_at: createdAt
    });
  }

  return {
    id: jobId,
    private_id: privateId,
    created_at: createdAt
  };
}

/** Create a paid job funded from the poster's MoltyBounty verified balance. Deducts amount+collateral and records job + poster_payment. */
export async function createPaidJobFromBalance(params: {
  description: string;
  amount: number;
  chain: string;
  posterWallet: string;
  posterUsername?: string | null;
  masterWallet: string;
  jobWallet: string;
}): Promise<{ id: number; private_id: string; created_at: string } | { success: false; error: string }> {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.createPaidJobFromBalanceTurso(params);
  }
  const collateralAmount = 0.001;
  const totalRequired = params.amount + collateralAmount;
  const deposit = await getDeposit(params.posterWallet, params.chain);
  if (!deposit) {
    return { success: false, error: "No MoltyBounty balance for this account on this chain. Deposit or use a different funding method." };
  }
  if (deposit.verified_balance < totalRequired) {
    return {
      success: false,
      error: `Insufficient MoltyBounty balance. Need ${totalRequired.toFixed(4)} ${params.chain} (bounty + collateral). Verified balance: ${deposit.verified_balance.toFixed(4)}.`,
    };
  }

  const privateId = generatePrivateId();
  const totalPaid = totalRequired;
  const posterUsername = params.posterUsername ?? null;
  const createdAt = new Date().toISOString();

  const run = db.transaction(() => {
    const newVerified = deposit.verified_balance - totalRequired;
    const newBalance = deposit.balance - totalRequired;
    db.prepare("UPDATE deposits SET verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?").run(
      newVerified,
      newBalance,
      params.posterWallet,
      params.chain
    );
    const jobInfo = db.prepare(
      `INSERT INTO jobs (private_id, description, amount, chain, poster_wallet, poster_username, master_wallet, job_wallet, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    ).run(
      privateId,
      params.description,
      params.amount,
      params.chain,
      params.posterWallet,
      posterUsername,
      params.masterWallet,
      params.jobWallet,
      createdAt
    );
    const jobId = Number(jobInfo.lastInsertRowid);
    db.prepare(
      `INSERT INTO poster_payments (job_id, poster_wallet, job_amount, collateral_amount, total_paid, transaction_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(jobId, params.posterWallet, params.amount, collateralAmount, totalPaid, null, createdAt);
    return { jobId, privateId, createdAt };
  });

  const out = run();
  return { id: out.jobId, private_id: out.privateId, created_at: out.createdAt };
}

export type PosterPaymentRecord = {
  id: number;
  job_id: number;
  poster_wallet: string;
  job_amount: number;
  collateral_amount: number;
  total_paid: number;
  transaction_hash: string | null;
  collateral_returned: boolean;
  returned_at: string | null;
  created_at: string;
};

export async function getPosterPayment(jobId: number) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getPosterPaymentTurso(jobId);
  }
  return db.prepare("SELECT * FROM poster_payments WHERE job_id = ?").get(jobId) as PosterPaymentRecord | undefined;
}

export async function returnPosterCollateral(jobId: number, chain: string) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.returnPosterCollateralTurso(jobId, chain);
  }
  const payment = await getPosterPayment(jobId);
  if (!payment || payment.collateral_returned) {
    return false;
  }
  
  // Create or update deposit for poster to return collateral
  const posterDeposit = await getDeposit(payment.poster_wallet, chain);
  
  if (posterDeposit) {
    // Update existing deposit - add to verified balance (since it's a return)
    const newVerifiedBalance = posterDeposit.verified_balance + payment.collateral_amount;
    const newBalance = posterDeposit.balance + payment.collateral_amount;
    db.prepare("UPDATE deposits SET verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?")
      .run(newVerifiedBalance, newBalance, payment.poster_wallet, chain);
  } else {
    // Create deposit record for poster if they don't have one
    await createDeposit({
      walletAddress: payment.poster_wallet,
      amount: payment.collateral_amount,
      chain: chain,
      status: "confirmed"
    });
    // Set verified balance equal to amount for new deposits
    db.prepare("UPDATE deposits SET verified_balance = balance WHERE wallet_address = ? AND chain = ?")
      .run(payment.poster_wallet, chain);
  }
  
  // Mark collateral as returned
  db.prepare("UPDATE poster_payments SET collateral_returned = 1, returned_at = ? WHERE job_id = ?")
    .run(new Date().toISOString(), jobId);
  
  return true;
}

export async function listJobs(status?: string) {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.listJobsTurso(status);
  }

  if (status) {
    return db
      .prepare("SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC")
      .all(status) as JobRecord[];
  }

  return db
    .prepare("SELECT * FROM jobs ORDER BY created_at DESC")
    .all() as JobRecord[];
}

export type ActivityFeedEvent = {
  type: "posted" | "claimed";
  username: string;
  amount: number;
  chain: string;
  bounty_id: number;
  description: string;
  created_at: string;
};

export async function getActivityFeed(limit: number = 50): Promise<ActivityFeedEvent[]> {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.getActivityFeedTurso(limit);
  }
  const posted = db
    .prepare(
      `SELECT id, poster_username as username, amount, chain, description, created_at FROM jobs
       WHERE poster_username IS NOT NULL AND poster_username != ''
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Array<{ id: number; username: string; amount: number; chain: string; description: string; created_at: string }>;
  const claimed = db
    .prepare(
      `SELECT j.id as bounty_id, s.agent_username as username, j.amount, j.chain, j.description, s.created_at
       FROM submissions s JOIN jobs j ON s.job_id = j.id
       WHERE s.agent_username IS NOT NULL AND s.agent_username != ''
       ORDER BY s.created_at DESC LIMIT ?`
    )
    .all(limit) as Array<{ bounty_id: number; username: string; amount: number; chain: string; description: string; created_at: string }>;
  const postedEvents: ActivityFeedEvent[] = posted.map((r) => ({
    type: "posted",
    username: r.username,
    amount: r.amount,
    chain: r.chain,
    bounty_id: r.id,
    description: r.description,
    created_at: r.created_at,
  }));
  const claimedEvents: ActivityFeedEvent[] = claimed.map((r) => ({
    type: "claimed",
    username: r.username,
    amount: r.amount,
    chain: r.chain,
    bounty_id: r.bounty_id,
    description: r.description,
    created_at: r.created_at,
  }));
  const merged = [...postedEvents, ...claimedEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return merged.slice(0, limit);
}

export async function getJob(id: number) {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.getJobTurso(id);
  }
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRecord | undefined;
}

export async function getJobByPrivateId(privateId: string) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getJobByPrivateIdTurso(privateId);
  }
  return db.prepare("SELECT * FROM jobs WHERE private_id = ?").get(privateId) as JobRecord | undefined;
}

export async function createSubmission(params: {
  jobId: number;
  response: string;
  agentWallet: string;
  agentUsername?: string | null;
  jobAmount: number;
  chain: string;
}) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.createSubmissionTurso(params);
  }
  const createdAt = new Date().toISOString();
  const deadline = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const agentUsername = params.agentUsername ?? null;

  const stmt = db.prepare(
    `INSERT INTO submissions (job_id, response, agent_wallet, agent_username, status, rating_deadline, created_at)
     VALUES (@job_id, @response, @agent_wallet, @agent_username, 'submitted', @rating_deadline, @created_at)`
  );

  const info = stmt.run({
    job_id: params.jobId,
    response: params.response,
    agent_wallet: params.agentWallet,
    agent_username: agentUsername,
    rating_deadline: deadline,
    created_at: createdAt
  });

  const submissionId = Number(info.lastInsertRowid);

  // Ensure agent has a deposit row (no collateral required; row created on first claim)
  let deposit = await getDeposit(params.agentWallet, params.chain);
  if (!deposit) {
    const createdAtDeposit = new Date().toISOString();
    db.prepare(
      `INSERT INTO deposits (wallet_address, amount, chain, transaction_hash, status, balance, pending_balance, verified_balance, created_at)
       VALUES (?, 0, ?, NULL, 'confirmed', ?, ?, 0, ?)`
    ).run(params.agentWallet, params.chain, params.jobAmount, params.jobAmount, createdAtDeposit);
  } else {
    const newPendingBalance = deposit.pending_balance + params.jobAmount;
    const newBalance = deposit.balance + params.jobAmount;
    db.prepare("UPDATE deposits SET pending_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?")
      .run(newPendingBalance, newBalance, params.agentWallet, params.chain);
  }

  return {
    id: submissionId,
    created_at: createdAt
  };
}

export function listSubmissions(jobId: number) {
  return db
    .prepare("SELECT * FROM submissions WHERE job_id = ? ORDER BY created_at DESC")
    .all(jobId) as SubmissionRecord[];
}

export async function getAgentSubmissionCount(agentWallet: string): Promise<number> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getAgentSubmissionCountTurso(agentWallet);
  }
  const row = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE agent_wallet = ?").get(agentWallet) as { count: number };
  return row?.count ?? 0;
}

export type AgentSubmissionRow = {
  submission_id: number;
  job_id: number;
  description: string;
  amount: number;
  chain: string;
  job_status: string;
  rating: number | null;
  created_at: string;
};

export async function listAgentSubmissions(agentWallet: string): Promise<AgentSubmissionRow[]> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.listAgentSubmissionsTurso(agentWallet);
  }
  return db
    .prepare(
      `SELECT s.id AS submission_id, s.job_id, j.description, j.amount, j.chain, j.status AS job_status, s.rating, s.created_at
       FROM submissions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.agent_wallet = ?
       ORDER BY s.created_at DESC`
    )
    .all(agentWallet) as AgentSubmissionRow[];
}

export async function getAgentRatings(agentWallet: string) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getAgentRatingsTurso(agentWallet);
  }
  const submissions = db
    .prepare("SELECT rating, created_at FROM submissions WHERE agent_wallet = ? AND rating IS NOT NULL AND rating > 0 ORDER BY created_at DESC")
    .all(agentWallet) as { rating: number; created_at: string }[];
  
  const ratings = submissions.map(s => s.rating);
  const average = ratings.length > 0 
    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
    : null;
  
  return {
    ratings: ratings,
    average: average,
    total_rated: ratings.length,
    breakdown: {
      5: ratings.filter(r => r === 5).length,
      4: ratings.filter(r => r === 4).length,
      3: ratings.filter(r => r === 3).length,
      2: ratings.filter(r => r === 2).length,
      1: ratings.filter(r => r === 1).length
    }
  };
}

export async function getAgentSubmissionCountByUsername(usernameLower: string): Promise<number> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getAgentSubmissionCountByUsernameTurso(usernameLower);
  }
  const row = db
    .prepare("SELECT COUNT(*) as count FROM submissions WHERE agent_username IS NOT NULL AND LOWER(agent_username) = ?")
    .get(usernameLower) as { count: number };
  return row?.count ?? 0;
}

export async function listAgentSubmissionsByUsername(usernameLower: string): Promise<AgentSubmissionRow[]> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.listAgentSubmissionsByUsernameTurso(usernameLower);
  }
  return db
    .prepare(
      `SELECT s.id AS submission_id, s.job_id, j.description, j.amount, j.chain, j.status AS job_status, s.rating, s.created_at
       FROM submissions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.agent_username IS NOT NULL AND LOWER(s.agent_username) = ?
       ORDER BY s.created_at DESC`
    )
    .all(usernameLower) as AgentSubmissionRow[];
}

export async function getAgentRatingsByUsername(usernameLower: string) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getAgentRatingsByUsernameTurso(usernameLower);
  }
  const submissions = db
    .prepare("SELECT rating, created_at FROM submissions WHERE agent_username IS NOT NULL AND LOWER(agent_username) = ? AND rating IS NOT NULL AND rating > 0 ORDER BY created_at DESC")
    .all(usernameLower) as { rating: number; created_at: string }[];
  const ratings = submissions.map(s => s.rating);
  const average = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
  return {
    ratings,
    average,
    total_rated: ratings.length,
    breakdown: {
      5: ratings.filter(r => r === 5).length,
      4: ratings.filter(r => r === 4).length,
      3: ratings.filter(r => r === 3).length,
      2: ratings.filter(r => r === 2).length,
      1: ratings.filter(r => r === 1).length,
    },
  };
}

export type TopAgentRow = {
  agent_wallet: string;
  agent_username: string | null;
  average_rating: number;
  total_rated: number;
};

export async function listTopRatedAgents(limit: number = 50): Promise<TopAgentRow[]> {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.listTopRatedAgentsTurso(limit);
  }
  const rows = db
    .prepare(
      `SELECT agent_wallet, MAX(agent_username) as agent_username, AVG(rating) as average_rating, COUNT(*) as total_rated
       FROM submissions
       WHERE rating IS NOT NULL AND rating > 0
       GROUP BY agent_wallet
       ORDER BY average_rating DESC, total_rated DESC
       LIMIT ?`
    )
    .all(limit) as TopAgentRow[];
  return rows;
}

export async function getSubmission(jobId: number) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getSubmissionTurso(jobId);
  }
  return db
    .prepare("SELECT * FROM submissions WHERE job_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(jobId) as SubmissionRecord | undefined;
}

export async function getSubmissionByJobPrivateId(privateId: string) {
  const job = await getJobByPrivateId(privateId);
  if (!job) return undefined;
  return await getSubmission(job.id);
}

export async function updateSubmissionRating(submissionId: number, rating: number, jobAmount: number, agentWallet: string, chain: string, posterWallet: string | null) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.updateSubmissionRatingTurso(submissionId, rating, jobAmount, agentWallet, chain, posterWallet);
  }
  const stmt = db.prepare("UPDATE submissions SET rating = ? WHERE id = ?");
  stmt.run(rating, submissionId);
  
  const deposit = await getDeposit(agentWallet, chain);
  if (!deposit) return;
  
  // Check if rating was submitted before deadline
  const submission = db.prepare("SELECT rating_deadline, created_at FROM submissions WHERE id = ?").get(submissionId) as { rating_deadline: string; created_at: string } | undefined;
  const now = new Date();
  const deadline = submission ? new Date(submission.rating_deadline) : null;
  const isLate = deadline && now > deadline;
  
  // No late penalty — only collateral forfeit applies when poster does not rate at all (handled in checkAndApplyLateRatingPenalties).

  // Rating 2+ stars: move from pending to verified (agent can withdraw). Rating 1: remove from pending only (no payout, no penalty).
  if (rating >= 2) {
    const newPendingBalance = Math.max(0, deposit.pending_balance - jobAmount);
    const newVerifiedBalance = deposit.verified_balance + jobAmount;
    const newBalance = newVerifiedBalance + newPendingBalance;
    db.prepare("UPDATE deposits SET pending_balance = ?, verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?")
      .run(newPendingBalance, newVerifiedBalance, newBalance, agentWallet, chain);
  } else {
    // 1 star: remove from pending only; no payout to verified, no penalty
    const newPendingBalance = Math.max(0, deposit.pending_balance - jobAmount);
    const newBalance = deposit.verified_balance + newPendingBalance;
    db.prepare("UPDATE deposits SET pending_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?")
      .run(newPendingBalance, newBalance, agentWallet, chain);
  }
}

export async function checkAndApplyLateRatingPenalties() {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.checkAndApplyLateRatingPenaltiesTurso();
  }
  const now = new Date().toISOString();
  const lateSubmissions = db.prepare(`
    SELECT s.id, s.job_id, s.agent_wallet, s.rating_deadline, j.chain, j.poster_wallet, j.amount
    FROM submissions s
    JOIN jobs j ON s.job_id = j.id
    WHERE s.rating IS NULL AND s.rating_deadline < ?
  `).all(now) as Array<{
    id: number;
    job_id: number;
    agent_wallet: string;
    rating_deadline: string;
    chain: string;
    poster_wallet: string | null;
    amount: number;
  }>;

  for (const sub of lateSubmissions) {
    // Poster collateral is not returned — keeping it is the only punishment for not rating.
    if (sub.amount > 0) {
      const agentDeposit = await getDeposit(sub.agent_wallet, sub.chain);
      if (agentDeposit) {
        const newPendingBalance = Math.max(0, agentDeposit.pending_balance - sub.amount);
        const newVerifiedBalance = agentDeposit.verified_balance + sub.amount;
        const newBalance = newVerifiedBalance + newPendingBalance;
        db.prepare("UPDATE deposits SET pending_balance = ?, verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?")
          .run(newPendingBalance, newVerifiedBalance, newBalance, sub.agent_wallet, sub.chain);
      }
    }
    db.prepare("UPDATE submissions SET rating = 0 WHERE id = ?").run(sub.id);
  }

  return lateSubmissions.length;
}

export async function updateJobStatus(jobId: number, status: string) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.updateJobStatusTurso(jobId, status);
  }
  const stmt = db.prepare("UPDATE jobs SET status = ? WHERE id = ?");
  stmt.run(status, jobId);
}

export async function createDeposit(params: {
  walletAddress: string;
  amount: number;
  chain: string;
  transactionHash?: string | null;
  status?: string;
}) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.createDepositTurso(params);
  }
  // Check if deposit already exists
  const existing = await getDeposit(params.walletAddress, params.chain);
  
  if (existing) {
    // Update existing deposit and add to balance
    // Additional deposits go to verified_balance (withdrawable)
    const newBalance = existing.balance + params.amount;
    const newVerifiedBalance = existing.verified_balance + params.amount;
    const stmt = db.prepare(
      `UPDATE deposits 
       SET amount = amount + @amount, 
           balance = @balance,
           verified_balance = @verified_balance,
           transaction_hash = COALESCE(@transaction_hash, transaction_hash),
           status = @status,
           created_at = @created_at
       WHERE wallet_address = @wallet_address AND chain = @chain`
    );
    stmt.run({
      wallet_address: params.walletAddress,
      amount: params.amount,
      balance: newBalance,
      verified_balance: newVerifiedBalance,
      chain: params.chain,
      transaction_hash: params.transactionHash ?? null,
      status: params.status || "confirmed",
      created_at: new Date().toISOString()
    });
    return {
      id: existing.id,
      created_at: existing.created_at
    };
  } else {
    // Create new deposit with balance equal to amount
    // Initial deposit goes to verified_balance since it's collateral that can be withdrawn
    const stmt = db.prepare(
      `INSERT INTO deposits (wallet_address, amount, chain, transaction_hash, status, balance, verified_balance, created_at)
       VALUES (@wallet_address, @amount, @chain, @transaction_hash, @status, @balance, @verified_balance, @created_at)`
    );

    const createdAt = new Date().toISOString();
    const info = stmt.run({
      wallet_address: params.walletAddress,
      amount: params.amount,
      chain: params.chain,
      transaction_hash: params.transactionHash ?? null,
      status: params.status || "confirmed",
      balance: params.amount, // Initial balance equals deposit amount
      verified_balance: params.amount, // Initial deposit is verified (withdrawable collateral)
      created_at: createdAt
    });

    return {
      id: Number(info.lastInsertRowid),
      created_at: createdAt
    };
  }
}

export async function getDeposit(walletAddress: string, chain: string) {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.getDepositTurso(walletAddress, chain);
  }
  return db
    .prepare("SELECT * FROM deposits WHERE wallet_address = ? AND chain = ?")
    .get(walletAddress, chain) as DepositRecord | undefined;
}

export async function hasSufficientCollateral(walletAddress: string, chain: string, requiredAmount: number = 0.1) {
  const deposit = await getDeposit(walletAddress, chain);
  return deposit !== undefined && deposit.status === "confirmed" && deposit.amount >= requiredAmount;
}

export async function getWalletBalance(walletAddress: string, chain: string): Promise<number> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getWalletBalanceTurso(walletAddress, chain);
  }
  const deposit = await getDeposit(walletAddress, chain);
  return deposit ? deposit.balance : 0;
}

export async function getWalletBalances(walletAddress: string, chain: string): Promise<{ balance: number; pending_balance: number; verified_balance: number }> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.getWalletBalancesTurso(walletAddress, chain);
  }
  const deposit = await getDeposit(walletAddress, chain);
  return deposit ? {
    balance: deposit.balance,
    pending_balance: deposit.pending_balance,
    verified_balance: deposit.verified_balance
  } : { balance: 0, pending_balance: 0, verified_balance: 0 };
}

export async function updateWalletBalance(walletAddress: string, chain: string, delta: number): Promise<number> {
  const deposit = await getDeposit(walletAddress, chain);
  if (!deposit) {
    throw new Error(`No deposit found for wallet ${walletAddress} on chain ${chain}`);
  }
  
  const newBalance = Math.max(0, deposit.balance + delta); // Ensure balance doesn't go below 0
  
  if (usingTurso) {
    const client = require("@libsql/client").createClient({
      url: process.env.TURSO_DB_URL!,
      authToken: process.env.TURSO_DB_AUTH_TOKEN!,
    });
    await client.execute({
      sql: "UPDATE deposits SET balance = ? WHERE wallet_address = ? AND chain = ?",
      args: [newBalance, walletAddress, chain],
    });
  } else {
    const stmt = db.prepare("UPDATE deposits SET balance = ? WHERE wallet_address = ? AND chain = ?");
    stmt.run(newBalance, walletAddress, chain);
  }
  
  return newBalance;
}

// Penalty amount for 1-2 star ratings
const PENALTY_AMOUNT = 0.01;

export async function hasPositiveBalance(walletAddress: string, chain: string): Promise<boolean> {
  // Require balance >= penalty amount to ensure worst case (1-2 star rating) doesn't go below 0
  const balance = await getWalletBalance(walletAddress, chain);
  return balance >= PENALTY_AMOUNT;
}

export async function listDeposits(walletAddress?: string) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.listDepositsTurso(walletAddress);
  }
  if (walletAddress) {
    return db
      .prepare("SELECT * FROM deposits WHERE wallet_address = ? ORDER BY created_at DESC")
      .all(walletAddress) as DepositRecord[];
  }
  return db
    .prepare("SELECT * FROM deposits ORDER BY created_at DESC")
    .all() as DepositRecord[];
}

export type WithdrawalRecord = {
  id: number;
  wallet_address: string;
  amount: number;
  chain: string;
  destination_wallet: string | null;
  transaction_hash: string | null;
  status: string;
  created_at: string;
};

export async function createWithdrawal(params: {
  walletAddress: string;
  amount: number;
  chain: string;
  destinationWallet?: string | null;
  transactionHash?: string | null;
  status?: string;
}) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.createWithdrawalTurso(params);
  }
  const stmt = db.prepare(
    `INSERT INTO withdrawals (wallet_address, amount, chain, destination_wallet, transaction_hash, status, created_at)
     VALUES (@wallet_address, @amount, @chain, @destination_wallet, @transaction_hash, @status, @created_at)`
  );

  const createdAt = new Date().toISOString();
  const info = stmt.run({
    wallet_address: params.walletAddress,
    amount: params.amount,
    chain: params.chain,
    destination_wallet: params.destinationWallet ?? null,
    transaction_hash: params.transactionHash ?? null,
    status: params.status || "pending",
    created_at: createdAt
  });

  return {
    id: Number(info.lastInsertRowid),
    created_at: createdAt
  };
}

export async function processWithdrawal(walletAddress: string, chain: string, amount: number): Promise<{ success: boolean; error?: string; newBalance?: number; newVerifiedBalance?: number }> {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.processWithdrawalTurso(walletAddress, chain, amount);
  }
  const deposit = await getDeposit(walletAddress, chain);
  if (!deposit) {
    return { success: false, error: "No deposit found for this wallet and chain." };
  }

  // Check if there's enough verified balance
  if (deposit.verified_balance < amount) {
    return { success: false, error: `Insufficient verified balance. Available: ${deposit.verified_balance}, Requested: ${amount}` };
  }

  // Check minimum balance requirement (0.01 SOL penalty amount)
  const MINIMUM_BALANCE = 0.01;
  const newBalance = deposit.balance - amount;
  const newVerifiedBalance = deposit.verified_balance - amount;

  if (newBalance < MINIMUM_BALANCE) {
    return { 
      success: false, 
      error: `Withdrawal would bring balance below minimum required (${MINIMUM_BALANCE} ${chain}). Current balance: ${deposit.balance}, After withdrawal: ${newBalance}` 
    };
  }

  // Update deposit balances
  db.prepare("UPDATE deposits SET verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?")
    .run(newVerifiedBalance, newBalance, walletAddress, chain);

  return {
    success: true,
    newBalance,
    newVerifiedBalance
  };
}

export async function listWithdrawals(walletAddress?: string) {
  if (usingTurso) {
    const turso = await getTurso();
    return turso.listWithdrawalsTurso(walletAddress);
  }
  if (walletAddress) {
    return db
      .prepare("SELECT * FROM withdrawals WHERE wallet_address = ? ORDER BY created_at DESC")
      .all(walletAddress) as WithdrawalRecord[];
  }
  return db
    .prepare("SELECT * FROM withdrawals ORDER BY created_at DESC")
    .all() as WithdrawalRecord[];
}

export async function deleteJob(privateId: string, posterWallet: string): Promise<{ success: boolean; error?: string; message?: string; collateral_returned?: number }> {
  if (usingTurso) {
    await ensureTursoSchema();
    const turso = await getTurso();
    return turso.deleteJobTurso(privateId, posterWallet);
  }

  // Get the job
  const job = await getJobByPrivateId(privateId);
  if (!job) {
    return { success: false, error: "Bounty not found." };
  }

  // Verify poster wallet matches
  if (job.poster_wallet !== posterWallet) {
    return { success: false, error: "Unauthorized. Only the poster can delete this bounty." };
  }

  // Verify job is still open (not claimed)
  if (job.status !== "open") {
    return { success: false, error: `Cannot delete bounty. Bounty status is "${job.status}" (must be "open").` };
  }

  // Get poster payment to return collateral
  const payment = await getPosterPayment(job.id);

  // Return collateral to poster if payment exists and collateral hasn't been returned
  if (payment && !payment.collateral_returned) {
    await returnPosterCollateral(job.id, job.chain);
  }

  // Delete poster payment record
  db.prepare("DELETE FROM poster_payments WHERE job_id = ?").run(job.id);

  // Delete the job
  db.prepare("DELETE FROM jobs WHERE id = ?").run(job.id);

  return {
    success: true,
    message: `Bounty deleted successfully. ${payment && !payment.collateral_returned ? `Collateral (${payment.collateral_amount} ${job.chain}) has been returned to your wallet.` : ""}`,
    collateral_returned: payment && !payment.collateral_returned ? payment.collateral_amount : 0
  };
}

export default db;
