// Turso HTTP API adapter for serverless environments
import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";

let tursoClient: ReturnType<typeof createClient> | null = null;

function getTursoClient() {
  if (!tursoClient && process.env.TURSO_DB_URL && process.env.TURSO_DB_AUTH_TOKEN) {
    tursoClient = createClient({
      url: process.env.TURSO_DB_URL,
      authToken: process.env.TURSO_DB_AUTH_TOKEN,
    });
  }
  return tursoClient;
}

// Helper to convert Turso rows to objects
function rowToObject(row: any): any {
  if (!row) return undefined;
  if (typeof row !== "object") return row;
  
  // Turso returns rows as objects with column names as keys
  return row;
}

// Helper to convert array of rows
function rowsToObjects(rows: any[]): any[] {
  return rows.map(row => rowToObject(row));
}

// Initialize schema (run once)
export async function initTursoSchema() {
  const client = getTursoClient();
  if (!client) return;

  const schema = `
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
      rating INTEGER,
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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_private_id ON jobs(private_id);

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
  `;

  // Execute schema creation (split by semicolon for better error handling)
  const statements = schema.split(";").filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      try {
        await client.execute(stmt.trim());
      } catch (error: any) {
        // Ignore "already exists" errors
        if (!error.message?.includes("already exists") && !error.message?.includes("duplicate")) {
          console.error("Schema creation error:", error.message);
        }
      }
    }
  }

  // agent_balances table
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS agent_balances (
        agent_id INTEGER NOT NULL,
        chain TEXT NOT NULL,
        verified_balance REAL NOT NULL DEFAULT 0.0,
        pending_balance REAL NOT NULL DEFAULT 0.0,
        balance REAL NOT NULL DEFAULT 0.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, chain),
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      )
    `);
  } catch (e: any) {
    if (!e.message?.includes("already exists")) console.error(e.message);
  }

  try {
    await client.execute("ALTER TABLE submissions ADD COLUMN agent_id INTEGER");
  } catch (e: any) {
    if (!e.message?.includes("duplicate column")) console.error(e.message);
  }

  // Migrations: add poster_username to jobs, agent_username to submissions, description to agents
  for (const sql of [
    "ALTER TABLE jobs ADD COLUMN poster_username TEXT",
    "ALTER TABLE submissions ADD COLUMN agent_username TEXT",
    "ALTER TABLE agents ADD COLUMN description TEXT",
    "ALTER TABLE jobs ADD COLUMN bounty_type TEXT NOT NULL DEFAULT 'agent'",
    "ALTER TABLE submissions ADD COLUMN human_id INTEGER",
    "ALTER TABLE submissions ADD COLUMN human_display_name TEXT",
  ]) {
    try {
      await client.execute(sql);
    } catch (error: any) {
      if (!error.message?.includes("duplicate column")) {
        console.error("Migration error:", error.message);
      }
    }
  }

  // Humans and human_wallets
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS humans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT,
        headline TEXT,
        bio TEXT,
        city TEXT,
        state TEXT,
        country TEXT,
        skills TEXT,
        social_links TEXT,
        rate_per_hour REAL,
        timezone TEXT,
        available BOOLEAN NOT NULL DEFAULT 1,
        show_email BOOLEAN NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_humans_email ON humans(email)");
  } catch (e: any) {
    if (!e.message?.includes("already exists")) console.error(e.message);
  }
  
  // Migrations for humans table
  for (const sql of [
    "ALTER TABLE humans ADD COLUMN headline TEXT",
    "ALTER TABLE humans ADD COLUMN city TEXT",
    "ALTER TABLE humans ADD COLUMN state TEXT",
    "ALTER TABLE humans ADD COLUMN country TEXT",
    "ALTER TABLE humans ADD COLUMN skills TEXT",
    "ALTER TABLE humans ADD COLUMN social_links TEXT",
    "ALTER TABLE humans ADD COLUMN rate_per_hour REAL",
    "ALTER TABLE humans ADD COLUMN timezone TEXT",
    "ALTER TABLE humans ADD COLUMN available BOOLEAN DEFAULT 1",
    "ALTER TABLE humans ADD COLUMN show_email BOOLEAN DEFAULT 0",
  ]) {
    try {
      await client.execute(sql);
      // Set default values for existing rows
      if (sql.includes("available")) {
        await client.execute("UPDATE humans SET available = 1 WHERE available IS NULL");
      }
      if (sql.includes("show_email")) {
        await client.execute("UPDATE humans SET show_email = 0 WHERE show_email IS NULL");
      }
    } catch (error: any) {
      if (!error.message?.includes("duplicate column") && !error.message?.includes("already exists")) {
        console.error("Migration error:", sql, error.message);
      }
    }
  }
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS human_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        human_id INTEGER NOT NULL,
        wallet_address TEXT NOT NULL,
        chain TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(human_id, chain),
        FOREIGN KEY (human_id) REFERENCES humans(id)
      )
    `);
    await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_human_wallets_human_chain ON human_wallets(human_id, chain)");
  } catch (e: any) {
    if (!e.message?.includes("already exists")) console.error(e.message);
  }
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS human_saved_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        human_id INTEGER NOT NULL,
        wallet_address TEXT NOT NULL,
        chain TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (human_id) REFERENCES humans(id)
      )
    `);
    await client.execute("CREATE INDEX IF NOT EXISTS idx_human_saved_wallets_human ON human_saved_wallets(human_id, chain)");
  } catch (e: any) {
    if (!e.message?.includes("already exists")) console.error(e.message);
  }
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS human_balances (
        human_id INTEGER NOT NULL,
        chain TEXT NOT NULL,
        verified_balance REAL NOT NULL DEFAULT 0.0,
        pending_balance REAL NOT NULL DEFAULT 0.0,
        balance REAL NOT NULL DEFAULT 0.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (human_id, chain),
        FOREIGN KEY (human_id) REFERENCES humans(id)
      )
    `);
  } catch (e: any) {
    if (!e.message?.includes("already exists")) console.error(e.message);
  }
}

// Generate secure private ID
function generatePrivateId(): string {
  const bytes = randomBytes(36);
  return bytes.toString("base64url");
}

// --- Agents (MoltyBounty ID) ---
export type AgentRecord = {
  id: number;
  username_lower: string;
  username_display: string;
  private_key_hash: string;
  description: string | null;
  created_at: string;
};

export async function createAgentTurso(params: {
  usernameLower: string;
  usernameDisplay: string;
  privateKeyHash: string;
  description?: string | null;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const createdAt = new Date().toISOString();
  const description = params.description ?? null;
  const result = await client.execute({
    sql: `INSERT INTO agents (username_lower, username_display, private_key_hash, description, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [params.usernameLower, params.usernameDisplay, params.privateKeyHash, description, createdAt],
  });
  return {
    id: Number(result.lastInsertRowid),
    username_lower: params.usernameLower,
    username_display: params.usernameDisplay,
    created_at: createdAt,
  };
}

export async function getAgentByUsernameTurso(usernameLower: string): Promise<AgentRecord | undefined> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT * FROM agents WHERE username_lower = ?",
    args: [usernameLower],
  });
  return rowToObject(result.rows[0]) as AgentRecord | undefined;
}

export async function getAgentByIdTurso(agentId: number): Promise<AgentRecord | undefined> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT * FROM agents WHERE id = ?",
    args: [agentId],
  });
  return rowToObject(result.rows[0]) as AgentRecord | undefined;
}

export async function linkWalletTurso(params: {
  agentId: number;
  walletAddress: string;
  chain: string;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const chain = params.chain.trim().toLowerCase();
  const wallet = params.walletAddress.trim();
  // Remove any existing link for this agent+chain so we can replace with new wallet
  await client.execute({
    sql: "DELETE FROM agent_wallets WHERE agent_id = ? AND chain = ?",
    args: [params.agentId, chain],
  });
  const createdAt = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO agent_wallets (agent_id, wallet_address, chain, created_at)
          VALUES (?, ?, ?, ?)`,
    args: [params.agentId, wallet, chain, createdAt],
  });
}

export async function getLinkedWalletTurso(agentId: number, chain: string): Promise<{ wallet_address: string } | undefined> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT wallet_address FROM agent_wallets WHERE agent_id = ? AND chain = ?",
    args: [agentId, chain.trim().toLowerCase()],
  });
  const row = rowToObject(result.rows[0]);
  return row ? { wallet_address: (row as { wallet_address: string }).wallet_address } : undefined;
}

export async function getAgentByWalletTurso(walletAddress: string, chain: string): Promise<AgentRecord | undefined> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: `SELECT a.* FROM agents a
          JOIN agent_wallets w ON w.agent_id = a.id
          WHERE w.wallet_address = ? AND w.chain = ?`,
    args: [walletAddress.trim(), chain.trim().toLowerCase()],
  });
  return rowToObject(result.rows[0]) as AgentRecord | undefined;
}

// --- Humans (Gmail sign-in, bio, linked wallets) ---
export type HumanRecord = {
  id: number;
  email: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  skills: string | null;
  social_links: string | null;
  rate_per_hour: number | null;
  timezone: string | null;
  available: boolean;
  show_email: boolean;
  created_at: string;
};

export async function createHumanTurso(params: { email: string; displayName?: string | null }): Promise<HumanRecord> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const createdAt = new Date().toISOString();
  const displayName = params.displayName ?? null;
  const result = await client.execute({
    sql: "INSERT INTO humans (email, display_name, headline, bio, city, state, country, skills, social_links, rate_per_hour, timezone, available, show_email, created_at) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 0, ?)",
    args: [params.email.trim().toLowerCase(), displayName, createdAt],
  });
  return {
    id: Number(result.lastInsertRowid),
    email: params.email.trim().toLowerCase(),
    display_name: displayName,
    headline: null,
    bio: null,
    city: null,
    state: null,
    country: null,
    skills: null,
    social_links: null,
    rate_per_hour: null,
    timezone: null,
    available: true,
    show_email: false,
    created_at: createdAt,
  };
}

export async function getHumanByEmailTurso(email: string): Promise<HumanRecord | undefined> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT * FROM humans WHERE email = ?",
    args: [email.trim().toLowerCase()],
  });
  return rowToObject(result.rows[0]) as HumanRecord | undefined;
}

export async function getHumanByIdTurso(id: number): Promise<HumanRecord | undefined> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT * FROM humans WHERE id = ?",
    args: [id],
  });
  return rowToObject(result.rows[0]) as HumanRecord | undefined;
}

export async function updateHumanTurso(params: {
  id: number;
  displayName?: string | null;
  headline?: string | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  skills?: string | null;
  socialLinks?: string | null;
  ratePerHour?: number | null;
  timezone?: string | null;
  available?: boolean;
  showEmail?: boolean;
}): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const human = await getHumanByIdTurso(params.id);
  if (!human) {
    throw new Error(`Human with id ${params.id} not found`);
  }
  const displayName = params.displayName !== undefined ? params.displayName : human.display_name;
  const headline = params.headline !== undefined ? params.headline : human.headline;
  const bio = params.bio !== undefined ? (params.bio && params.bio.length > 200 ? params.bio.slice(0, 200) : params.bio) : human.bio;
  const city = params.city !== undefined ? params.city : human.city;
  const state = params.state !== undefined ? params.state : human.state;
  const country = params.country !== undefined ? params.country : human.country;
  const skills = params.skills !== undefined ? params.skills : human.skills;
  const socialLinks = params.socialLinks !== undefined ? params.socialLinks : human.social_links;
  const ratePerHour = params.ratePerHour !== undefined ? params.ratePerHour : human.rate_per_hour;
  const timezone = params.timezone !== undefined ? params.timezone : human.timezone;
  const available = params.available !== undefined ? params.available : (human.available ?? true);
  const showEmail = params.showEmail !== undefined ? params.showEmail : (human.show_email ?? false);
  try {
    await client.execute({
      sql: "UPDATE humans SET display_name = ?, headline = ?, bio = ?, city = ?, state = ?, country = ?, skills = ?, social_links = ?, rate_per_hour = ?, timezone = ?, available = ?, show_email = ? WHERE id = ?",
      args: [displayName, headline, bio, city, state, country, skills, socialLinks, ratePerHour, timezone, available ? 1 : 0, showEmail ? 1 : 0, params.id],
    });
  } catch (error: any) {
    console.error("Error updating human Turso:", error);
    console.error("SQL params:", { displayName, headline, bio, city, state, country, skills, socialLinks, ratePerHour, timezone, available, showEmail, id: params.id });
    throw new Error(`Failed to update human: ${error.message}`);
  }
}

export async function linkHumanWalletTurso(params: { humanId: number; walletAddress: string; chain: string }): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const chain = params.chain.trim().toLowerCase();
  const wallet = params.walletAddress.trim();
  await client.execute({
    sql: "DELETE FROM human_wallets WHERE human_id = ? AND chain = ?",
    args: [params.humanId, chain],
  });
  const createdAt = new Date().toISOString();
  await client.execute({
    sql: "INSERT INTO human_wallets (human_id, wallet_address, chain, created_at) VALUES (?, ?, ?, ?)",
    args: [params.humanId, wallet, chain, createdAt],
  });
}

export async function addHumanSavedWalletTurso(params: { humanId: number; walletAddress: string; chain: string; label?: string | null }): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const chain = params.chain.trim().toLowerCase();
  const wallet = params.walletAddress.trim();
  const createdAt = new Date().toISOString();
  await client.execute({
    sql: "INSERT INTO human_saved_wallets (human_id, wallet_address, chain, label, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [params.humanId, wallet, chain, params.label || null, createdAt],
  });
}

export async function listHumanSavedWalletsTurso(humanId: number, chain?: string): Promise<Array<{ id: number; wallet_address: string; chain: string; label: string | null; created_at: string }>> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  if (chain) {
    const result = await client.execute({
      sql: "SELECT id, wallet_address, chain, label, created_at FROM human_saved_wallets WHERE human_id = ? AND chain = ? ORDER BY created_at DESC",
      args: [humanId, chain.trim().toLowerCase()],
    });
    return rowsToObjects(result.rows) as Array<{ id: number; wallet_address: string; chain: string; label: string | null; created_at: string }>;
  }
  const result = await client.execute({
    sql: "SELECT id, wallet_address, chain, label, created_at FROM human_saved_wallets WHERE human_id = ? ORDER BY created_at DESC",
    args: [humanId],
  });
  return rowsToObjects(result.rows) as Array<{ id: number; wallet_address: string; chain: string; label: string | null; created_at: string }>;
}

export async function deleteHumanSavedWalletTurso(humanId: number, walletId: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  await client.execute({
    sql: "DELETE FROM human_saved_wallets WHERE id = ? AND human_id = ?",
    args: [walletId, humanId],
  });
}

export async function getLinkedHumanWalletTurso(humanId: number, chain: string): Promise<{ wallet_address: string } | undefined> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT wallet_address FROM human_wallets WHERE human_id = ? AND chain = ?",
    args: [humanId, chain.trim().toLowerCase()],
  });
  return rowToObject(result.rows[0]) as { wallet_address: string } | undefined;
}

export async function getHumanBalancesTurso(humanId: number, chain: string): Promise<{ balance: number; pending_balance: number; verified_balance: number }> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT balance, pending_balance, verified_balance FROM human_balances WHERE human_id = ? AND chain = ?",
    args: [humanId, chain.trim().toLowerCase()],
  });
  const row = rowToObject(result.rows[0]) as { balance: number; pending_balance: number; verified_balance: number } | undefined;
  return row ?? { balance: 0, pending_balance: 0, verified_balance: 0 };
}

export async function ensureHumanBalanceRowTurso(humanId: number, chain: string): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const existing = await client.execute({
    sql: "SELECT 1 FROM human_balances WHERE human_id = ? AND chain = ?",
    args: [humanId, chain.trim().toLowerCase()],
  });
  if (existing.rows.length === 0) {
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO human_balances (human_id, chain, verified_balance, pending_balance, balance, created_at, updated_at)
       VALUES (?, ?, 0.0, 0.0, 0.0, ?, ?)`,
      args: [humanId, chain.trim().toLowerCase(), now, now],
    });
  }
}

export async function creditHumanPendingTurso(humanId: number, chain: string, amount: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  await ensureHumanBalanceRowTurso(humanId, chain);
  const row = await getHumanBalancesTurso(humanId, chain);
  const newPending = row.pending_balance + amount;
  const newBalance = row.balance + amount;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE human_balances SET pending_balance = ?, balance = ?, updated_at = ? WHERE human_id = ? AND chain = ?",
    args: [newPending, newBalance, now, humanId, chain.trim().toLowerCase()],
  });
}

export async function moveHumanPendingToVerifiedTurso(humanId: number, chain: string, amount: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  await ensureHumanBalanceRowTurso(humanId, chain);
  const row = await getHumanBalancesTurso(humanId, chain);
  const newPending = Math.max(0, row.pending_balance - amount);
  const newVerified = row.verified_balance + amount;
  const newBalance = newPending + newVerified;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE human_balances SET pending_balance = ?, verified_balance = ?, balance = ?, updated_at = ? WHERE human_id = ? AND chain = ?",
    args: [newPending, newVerified, newBalance, now, humanId, chain.trim().toLowerCase()],
  });
}

export async function creditHumanVerifiedTurso(humanId: number, chain: string, amount: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  await ensureHumanBalanceRowTurso(humanId, chain);
  const row = await getHumanBalancesTurso(humanId, chain);
  const newVerified = row.verified_balance + amount;
  const newBalance = row.balance + amount;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE human_balances SET verified_balance = ?, balance = ?, updated_at = ? WHERE human_id = ? AND chain = ?",
    args: [newVerified, newBalance, now, humanId, chain.trim().toLowerCase()],
  });
}

export async function processHumanWithdrawalTurso(humanId: number, chain: string, amount: number): Promise<{ success: boolean; error?: string }> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  await ensureHumanBalanceRowTurso(humanId, chain);
  const row = await getHumanBalancesTurso(humanId, chain);
  if (row.verified_balance < amount) {
    return { success: false, error: `Insufficient verified balance. Available: ${row.verified_balance}, Requested: ${amount}` };
  }
  const newVerified = row.verified_balance - amount;
  const newBalance = newVerified + (row.balance - row.verified_balance);
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE human_balances SET verified_balance = ?, balance = ?, updated_at = ? WHERE human_id = ? AND chain = ?",
    args: [newVerified, newBalance, now, humanId, chain.trim().toLowerCase()],
  });
  return { success: true };
}

export async function listAllAgentsTurso(limit?: number): Promise<AgentRecord[]> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  if (limit) {
    const result = await client.execute({
      sql: "SELECT * FROM agents ORDER BY created_at DESC LIMIT ?",
      args: [limit],
    });
    return rowsToObjects(result.rows) as AgentRecord[];
  }
  const result = await client.execute({
    sql: "SELECT * FROM agents ORDER BY created_at DESC",
    args: [],
  });
  return rowsToObjects(result.rows) as AgentRecord[];
}

export async function listAllHumansTurso(limit?: number, availableOnly?: boolean): Promise<HumanRecord[]> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  let sql = "SELECT * FROM humans";
  if (availableOnly) {
    sql += " WHERE available = 1";
  }
  sql += " ORDER BY created_at DESC";
  if (limit) {
    sql += " LIMIT ?";
    const result = await client.execute({ sql, args: [limit] });
    return rowsToObjects(result.rows) as HumanRecord[];
  }
  const result = await client.execute({ sql, args: [] });
  return rowsToObjects(result.rows) as HumanRecord[];
}

export async function getAgentBalancesTurso(agentId: number, chain: string): Promise<{ balance: number; pending_balance: number; verified_balance: number }> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT balance, pending_balance, verified_balance FROM agent_balances WHERE agent_id = ? AND chain = ?",
    args: [agentId, chain],
  });
  const row = rowToObject(result.rows[0]) as { balance: number; pending_balance: number; verified_balance: number } | undefined;
  return row ?? { balance: 0, pending_balance: 0, verified_balance: 0 };
}

export async function ensureAgentBalanceRowTurso(agentId: number, chain: string): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const existing = await client.execute({
    sql: "SELECT 1 FROM agent_balances WHERE agent_id = ? AND chain = ?",
    args: [agentId, chain],
  });
  if (existing.rows.length === 0) {
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO agent_balances (agent_id, chain, verified_balance, pending_balance, balance, created_at, updated_at)
            VALUES (?, ?, 0, 0, 0, ?, ?)`,
      args: [agentId, chain, now, now],
    });
  }
}

export async function creditAgentPendingTurso(agentId: number, chain: string, amount: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  await ensureAgentBalanceRowTurso(agentId, chain);
  const row = (await getAgentBalancesTurso(agentId, chain)) as { pending_balance: number; balance: number };
  const newPending = row.pending_balance + amount;
  const newBalance = row.balance + amount;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE agent_balances SET pending_balance = ?, balance = ?, updated_at = ? WHERE agent_id = ? AND chain = ?",
    args: [newPending, newBalance, now, agentId, chain],
  });
}

export async function moveAgentPendingToVerifiedTurso(agentId: number, chain: string, amount: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const row = (await getAgentBalancesTurso(agentId, chain)) as { pending_balance: number; verified_balance: number };
  const newPending = Math.max(0, row.pending_balance - amount);
  const newVerified = row.verified_balance + amount;
  const newBalance = newPending + newVerified;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE agent_balances SET pending_balance = ?, verified_balance = ?, balance = ?, updated_at = ? WHERE agent_id = ? AND chain = ?",
    args: [newPending, newVerified, newBalance, now, agentId, chain],
  });
}

export async function deductAgentPendingTurso(agentId: number, chain: string, amount: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const row = (await getAgentBalancesTurso(agentId, chain)) as { pending_balance: number; balance: number };
  const newPending = Math.max(0, row.pending_balance - amount);
  const newBalance = row.balance - amount;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE agent_balances SET pending_balance = ?, balance = ?, updated_at = ? WHERE agent_id = ? AND chain = ?",
    args: [newPending, newBalance, now, agentId, chain],
  });
}

export async function debitAgentVerifiedTurso(agentId: number, chain: string, amount: number): Promise<{ success: boolean; error?: string }> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const row = (await getAgentBalancesTurso(agentId, chain)) as { verified_balance: number; balance: number };
  if (row.verified_balance < amount) return { success: false, error: `Insufficient verified balance. Available: ${row.verified_balance}, Requested: ${amount}` };
  const newVerified = row.verified_balance - amount;
  const newBalance = row.balance - amount;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE agent_balances SET verified_balance = ?, balance = ?, updated_at = ? WHERE agent_id = ? AND chain = ?",
    args: [newVerified, newBalance, now, agentId, chain],
  });
  return { success: true };
}

export async function creditAgentVerifiedTurso(agentId: number, chain: string, amount: number): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  await ensureAgentBalanceRowTurso(agentId, chain);
  const row = (await getAgentBalancesTurso(agentId, chain)) as { verified_balance: number; balance: number };
  const newVerified = row.verified_balance + amount;
  const newBalance = row.balance + amount;
  const now = new Date().toISOString();
  await client.execute({
    sql: "UPDATE agent_balances SET verified_balance = ?, balance = ?, updated_at = ? WHERE agent_id = ? AND chain = ?",
    args: [newVerified, newBalance, now, agentId, chain],
  });
}

// Database operations using Turso HTTP API
export async function createJobTurso(params: {
  description: string;
  amount: number;
  chain: string;
  posterWallet: string | null;
  posterUsername?: string | null;
  bountyType?: "agent" | "human";
  masterWallet: string;
  jobWallet: string;
  transactionHash?: string | null;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const privateId = generatePrivateId();
  const isFreeTask = params.amount === 0;
  const collateralAmount = 0.001;
  const totalPaid = params.amount + collateralAmount;
  const createdAt = new Date().toISOString();
  const bountyType = params.bountyType ?? "agent";
  const posterUsername = params.posterUsername ?? null;

  const jobResult = await client.execute({
    sql: `INSERT INTO jobs (private_id, description, amount, chain, poster_wallet, poster_username, bounty_type, master_wallet, job_wallet, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    args: [
      privateId,
      params.description,
      params.amount,
      params.chain,
      params.posterWallet,
      posterUsername,
      bountyType,
      params.masterWallet,
      params.jobWallet,
      createdAt
    ],
  });

  const jobId = Number(jobResult.lastInsertRowid);

  // Insert poster payment only for paid jobs (free tasks have no poster payment)
  if (!isFreeTask && params.posterWallet) {
    await client.execute({
      sql: `INSERT INTO poster_payments (job_id, poster_wallet, job_amount, collateral_amount, total_paid, transaction_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        jobId,
        params.posterWallet,
        params.amount,
        collateralAmount,
        totalPaid,
        params.transactionHash ?? null,
        createdAt
      ],
    });
  }

  return {
    id: jobId,
    private_id: privateId,
    created_at: createdAt
  };
}

/** Create a paid job funded from the poster's MoltyBounty verified balance (agent account). */
export async function createPaidJobFromBalanceTurso(params: {
  description: string;
  amount: number;
  chain: string;
  posterAgentId: number;
  posterUsername?: string | null;
  bountyType?: "agent" | "human";
  masterWallet: string;
  jobWallet: string;
}): Promise<{ id: number; private_id: string; created_at: string } | { success: false; error: string }> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const collateralAmount = 0.001;
  const totalRequired = params.amount + collateralAmount;
  const balances = await getAgentBalancesTurso(params.posterAgentId, params.chain);
  if (balances.verified_balance < totalRequired) {
    return {
      success: false,
      error: `Insufficient MoltyBounty balance. Need ${totalRequired.toFixed(4)} USDC (bounty + collateral). Verified balance: ${balances.verified_balance.toFixed(4)} USDC.`,
    };
  }

  const debitResult = await debitAgentVerifiedTurso(params.posterAgentId, params.chain, totalRequired);
  if (!debitResult.success) return { success: false, error: debitResult.error! };

  const privateId = generatePrivateId();
  const totalPaid = totalRequired;
  const posterUsername = params.posterUsername ?? null;
  const bountyType = params.bountyType ?? "agent";
  const createdAt = new Date().toISOString();
  const posterWalletPlaceholder = `moltybounty:${params.posterAgentId}`;

  try {
    const jobResult = await client.execute({
      sql: `INSERT INTO jobs (private_id, description, amount, chain, poster_wallet, poster_username, bounty_type, master_wallet, job_wallet, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      args: [
        privateId,
        params.description,
        params.amount,
        params.chain,
        posterWalletPlaceholder,
        posterUsername,
        bountyType,
        params.masterWallet,
        params.jobWallet,
        createdAt,
      ],
    });
    const jobId = Number(jobResult.lastInsertRowid);
    await client.execute({
      sql: `INSERT INTO poster_payments (job_id, poster_wallet, job_amount, collateral_amount, total_paid, transaction_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        jobId,
        posterWalletPlaceholder,
        params.amount,
        collateralAmount,
        totalPaid,
        null,
        createdAt,
      ],
    });
    return { id: jobId, private_id: privateId, created_at: createdAt };
  } catch (e) {
    await creditAgentVerifiedTurso(params.posterAgentId, params.chain, totalRequired);
    throw e;
  }
}

/** Create a paid job with poster wallet (anonymous UI). No balance check: in production funding is a one-time crypto tx. Deduct only if wallet already has sufficient balance. Poster shown as @anonymous. When transactionHash is provided, no deposit deduction. */
export async function createPaidJobFromWalletTurso(params: {
  description: string;
  amount: number;
  chain: string;
  posterWallet: string;
  bountyType?: "agent" | "human";
  masterWallet: string;
  jobWallet: string;
  transactionHash?: string | null;
  collateralAmount?: number;
}): Promise<{ id: number; private_id: string; created_at: string } | { success: false; error: string }> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const collateralAmount = params.collateralAmount ?? 0.001;
  const totalRequired = params.amount + collateralAmount;
  const txVerified = !!params.transactionHash;
  const bountyType = params.bountyType ?? "human";
  const deposit = txVerified ? null : await getDepositTurso(params.posterWallet, params.chain);
  const verifiedBalance = (deposit as { verified_balance?: number } | undefined)?.verified_balance ?? 0;
  const hasSufficient = !txVerified && verifiedBalance >= totalRequired;
  let agent: Awaited<ReturnType<typeof getAgentByWalletTurso>> | undefined;
  if (hasSufficient) {
    agent = await getAgentByWalletTurso(params.posterWallet, params.chain);
    if (agent) {
      const debitResult = await debitAgentVerifiedTurso(agent.id, params.chain, totalRequired);
      if (!debitResult.success) return { success: false, error: debitResult.error! };
    } else {
      const rowResult = await client.execute({
        sql: "SELECT verified_balance, balance FROM deposits WHERE wallet_address = ? AND chain = ?",
        args: [params.posterWallet, params.chain],
      });
      const row = rowToObject(rowResult.rows[0]) as { verified_balance: number; balance: number } | undefined;
      if (row && row.verified_balance >= totalRequired) {
        const newVerified = row.verified_balance - totalRequired;
        const newBalance = row.balance - totalRequired;
        await client.execute({
          sql: "UPDATE deposits SET verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
          args: [newVerified, newBalance, params.posterWallet, params.chain],
        });
      }
    }
  }
  const privateId = generatePrivateId();
  const totalPaid = totalRequired;
  const createdAt = new Date().toISOString();
  try {
    const jobResult = await client.execute({
      sql: `INSERT INTO jobs (private_id, description, amount, chain, poster_wallet, poster_username, bounty_type, master_wallet, job_wallet, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      args: [
        privateId,
        params.description,
        params.amount,
        params.chain,
        params.posterWallet,
        "anonymous",
        bountyType,
        params.masterWallet,
        params.jobWallet,
        createdAt,
      ],
    });
    const jobId = Number(jobResult.lastInsertRowid);
    await client.execute({
      sql: `INSERT INTO poster_payments (job_id, poster_wallet, job_amount, collateral_amount, total_paid, transaction_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        jobId,
        params.posterWallet,
        params.amount,
        collateralAmount,
        totalPaid,
        params.transactionHash ?? null,
        createdAt,
      ],
    });
    return { id: jobId, private_id: privateId, created_at: createdAt };
  } catch (e) {
    if (hasSufficient) {
      if (agent) {
        await creditAgentVerifiedTurso(agent.id, params.chain, totalRequired);
      } else {
        await client.execute({
          sql: "UPDATE deposits SET verified_balance = verified_balance + ?, balance = balance + ? WHERE wallet_address = ? AND chain = ?",
          args: [totalRequired, totalRequired, params.posterWallet, params.chain],
        });
      }
    }
    throw e;
  }
}

export async function listJobsTurso(status?: string, bountyType?: "agent" | "human") {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  let result;
  if (status && bountyType) {
    result = await client.execute({
      sql: "SELECT * FROM jobs WHERE status = ? AND bounty_type = ? ORDER BY created_at DESC",
      args: [status, bountyType],
    });
  } else if (status) {
    result = await client.execute({
      sql: "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC",
      args: [status],
    });
  } else if (bountyType) {
    result = await client.execute({
      sql: "SELECT * FROM jobs WHERE bounty_type = ? ORDER BY created_at DESC",
      args: [bountyType],
    });
  } else {
    result = await client.execute({
      sql: "SELECT * FROM jobs ORDER BY created_at DESC",
      args: [],
    });
  }

  return rowsToObjects(result.rows);
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

export async function getActivityFeedTurso(limit: number = 50): Promise<ActivityFeedEvent[]> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const postedResult = await client.execute({
    sql: `SELECT id, poster_username as username, amount, chain, description, created_at FROM jobs
          WHERE poster_username IS NOT NULL AND poster_username != ''
          ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });
  const claimedResult = await client.execute({
    sql: `SELECT j.id as bounty_id, s.agent_username as username, j.amount, j.chain, j.description, s.created_at
          FROM submissions s JOIN jobs j ON s.job_id = j.id
          WHERE s.agent_username IS NOT NULL AND s.agent_username != ''
          ORDER BY s.created_at DESC LIMIT ?`,
    args: [limit],
  });

  const posted = rowsToObjects(postedResult.rows).map((r: Record<string, unknown>) => ({
    type: "posted" as const,
    username: r.username as string,
    amount: r.amount as number,
    chain: r.chain as string,
    bounty_id: r.id as number,
    description: (r.description as string) ?? "",
    created_at: r.created_at as string,
  }));
  const claimed = rowsToObjects(claimedResult.rows).map((r: Record<string, unknown>) => ({
    type: "claimed" as const,
    username: r.username as string,
    amount: r.amount as number,
    chain: r.chain as string,
    bounty_id: r.bounty_id as number,
    description: (r.description as string) ?? "",
    created_at: r.created_at as string,
  }));
  const merged = [...posted, ...claimed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return merged.slice(0, limit);
}

export async function getJobTurso(id: number) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: "SELECT * FROM jobs WHERE id = ?",
    args: [id],
  });

  return rowToObject(result.rows[0]);
}

export async function getJobByPrivateIdTurso(privateId: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: "SELECT * FROM jobs WHERE private_id = ?",
    args: [privateId],
  });

  return rowToObject(result.rows[0]);
}

export async function createSubmissionTurso(params: {
  jobId: number;
  response: string;
  agentWallet: string;
  agentUsername?: string | null;
  agentId?: number | null;
  humanId?: number | null;
  humanDisplayName?: string | null;
  jobAmount: number;
  chain: string;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const createdAt = new Date().toISOString();
  const deadline = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const agentUsername = params.agentUsername ?? null;
  const agentId = params.agentId ?? null;
  const humanId = params.humanId ?? null;
  const humanDisplayName = params.humanDisplayName ?? null;

  const result = await client.execute({
    sql: `INSERT INTO submissions (job_id, response, agent_wallet, agent_username, agent_id, human_id, human_display_name, status, rating_deadline, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`,
    args: [
      params.jobId,
      params.response,
      params.agentWallet,
      agentUsername,
      agentId ?? null,
      humanId,
      humanDisplayName,
      deadline,
      createdAt
    ],
  });

  const submissionId = Number(result.lastInsertRowid);

  if (humanId != null && params.jobAmount > 0) {
    await creditHumanPendingTurso(humanId, params.chain, params.jobAmount);
  } else if (agentId != null) {
    await creditAgentPendingTurso(agentId, params.chain, params.jobAmount);
  } else {
    const deposit = await getDepositTurso(params.agentWallet, params.chain);
    if (!deposit) {
      const createdAtDeposit = new Date().toISOString();
      await client.execute({
        sql: `INSERT INTO deposits (wallet_address, amount, chain, transaction_hash, status, balance, pending_balance, verified_balance, created_at)
              VALUES (?, 0, ?, NULL, 'confirmed', ?, ?, 0, ?)`,
        args: [params.agentWallet, params.chain, params.jobAmount, params.jobAmount, createdAtDeposit],
      });
    } else {
      const newPendingBalance = deposit.pending_balance + params.jobAmount;
      const newBalance = deposit.balance + params.jobAmount;
      await client.execute({
        sql: "UPDATE deposits SET pending_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
        args: [newPendingBalance, newBalance, params.agentWallet, params.chain],
      });
    }
  }

  return {
    id: submissionId,
    created_at: createdAt
  };
}

export async function getSubmissionTurso(jobId: number) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: "SELECT * FROM submissions WHERE job_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [jobId],
  });

  return rowToObject(result.rows[0]);
}

export async function getSubmissionByJobPrivateIdTurso(privateId: string) {
  const job = await getJobByPrivateIdTurso(privateId);
  if (!job) return undefined;
  return getSubmissionTurso(job.id);
}

export async function updateSubmissionRatingTurso(
  submissionId: number,
  rating: number,
  jobAmount: number,
  agentWallet: string,
  chain: string,
  posterWallet: string | null
) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const existing = await client.execute({
    sql: "SELECT rating FROM submissions WHERE id = ?",
    args: [submissionId],
  });
  const row = rowToObject(existing.rows[0]) as { rating: number | null } | undefined;
  const currentRating = row?.rating;
  if (currentRating !== null && currentRating !== undefined) {
    throw new Error("Submission already rated; ratings are immutable.");
  }

  await client.execute({
    sql: "UPDATE submissions SET rating = ? WHERE id = ?",
    args: [rating, submissionId],
  });

  const subRow = await client.execute({
    sql: "SELECT agent_id, human_id FROM submissions WHERE id = ?",
    args: [submissionId],
  });
  const sub = rowToObject(subRow.rows[0]) as { agent_id: number | null; human_id: number | null } | undefined;
  const agentId = sub?.agent_id ?? null;
  const humanId = sub?.human_id ?? null;

  if (humanId != null && jobAmount > 0) {
    if (rating >= 2) {
      await moveHumanPendingToVerifiedTurso(humanId, chain, jobAmount);
    } else {
      // For humans, if rating < 2, we still need to deduct pending but don't move to verified
      await ensureHumanBalanceRowTurso(humanId, chain);
      const row = await getHumanBalancesTurso(humanId, chain);
      const newPending = Math.max(0, row.pending_balance - jobAmount);
      const newBalance = row.balance - jobAmount;
      const now = new Date().toISOString();
      await client.execute({
        sql: "UPDATE human_balances SET pending_balance = ?, balance = ?, updated_at = ? WHERE human_id = ? AND chain = ?",
        args: [newPending, newBalance, now, humanId, chain.trim().toLowerCase()],
      });
    }
    return;
  }

  if (agentId != null) {
    if (rating >= 2) {
      await moveAgentPendingToVerifiedTurso(agentId, chain, jobAmount);
    } else {
      await deductAgentPendingTurso(agentId, chain, jobAmount);
    }
    return;
  }

  const deposit = await getDepositTurso(agentWallet, chain);
  if (!deposit) return;

  if (rating >= 2) {
    const newPendingBalance = Math.max(0, deposit.pending_balance - jobAmount);
    const newVerifiedBalance = deposit.verified_balance + jobAmount;
    const newBalance = newVerifiedBalance + newPendingBalance;
    await client.execute({
      sql: "UPDATE deposits SET pending_balance = ?, verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
      args: [newPendingBalance, newVerifiedBalance, newBalance, agentWallet, chain],
    });
  } else {
    const newPendingBalance = Math.max(0, deposit.pending_balance - jobAmount);
    const newBalance = deposit.verified_balance + newPendingBalance;
    await client.execute({
      sql: "UPDATE deposits SET pending_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
      args: [newPendingBalance, newBalance, agentWallet, chain],
    });
  }
}

export async function getAgentSubmissionCountTurso(agentWallet: string): Promise<number> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT COUNT(*) as count FROM submissions WHERE agent_wallet = ?",
    args: [agentWallet],
  });
  const row = result.rows[0] as { count?: number } | undefined;
  return row?.count ?? 0;
}

export async function listAgentSubmissionsTurso(agentWallet: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: `SELECT s.id AS submission_id, s.job_id, j.description, j.amount, j.chain, j.status AS job_status, s.rating, s.created_at
          FROM submissions s
          JOIN jobs j ON j.id = s.job_id
          WHERE s.agent_wallet = ?
          ORDER BY s.created_at DESC`,
    args: [agentWallet],
  });
  return rowsToObjects(result.rows) as Array<{
    submission_id: number;
    job_id: number;
    description: string;
    amount: number;
    chain: string;
    job_status: string;
    rating: number | null;
    created_at: string;
  }>;
}

export async function getAgentRatingsTurso(agentWallet: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: "SELECT rating, created_at FROM submissions WHERE agent_wallet = ? AND rating IS NOT NULL AND rating > 0 ORDER BY created_at DESC",
    args: [agentWallet],
  });

  const submissions = rowsToObjects(result.rows) as { rating: number; created_at: string }[];
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

export async function getAgentSubmissionCountByAgentIdTurso(agentId: number): Promise<number> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT COUNT(*) as count FROM submissions WHERE agent_id = ?",
    args: [agentId],
  });
  const row = result.rows[0] as { count?: number } | undefined;
  return row?.count ?? 0;
}

export async function getAgentSubmissionCountByUsernameTurso(usernameLower: string): Promise<number> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT COUNT(*) as count FROM submissions WHERE agent_username IS NOT NULL AND LOWER(agent_username) = ?",
    args: [usernameLower],
  });
  const row = result.rows[0] as { count?: number } | undefined;
  return row?.count ?? 0;
}

export async function listAgentSubmissionsByAgentIdTurso(agentId: number) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: `SELECT s.id AS submission_id, s.job_id, j.description, j.amount, j.chain, j.status AS job_status, s.rating, s.created_at
          FROM submissions s
          JOIN jobs j ON j.id = s.job_id
          WHERE s.agent_id = ?
          ORDER BY s.created_at DESC`,
    args: [agentId],
  });
  return rowsToObjects(result.rows) as Array<{
    submission_id: number;
    job_id: number;
    description: string;
    amount: number;
    chain: string;
    job_status: string;
    rating: number | null;
    created_at: string;
  }>;
}

export async function listAgentSubmissionsByUsernameTurso(usernameLower: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: `SELECT s.id AS submission_id, s.job_id, j.description, j.amount, j.chain, j.status AS job_status, s.rating, s.created_at
          FROM submissions s
          JOIN jobs j ON j.id = s.job_id
          WHERE s.agent_username IS NOT NULL AND LOWER(s.agent_username) = ?
          ORDER BY s.created_at DESC`,
    args: [usernameLower],
  });
  return rowsToObjects(result.rows) as Array<{
    submission_id: number;
    job_id: number;
    description: string;
    amount: number;
    chain: string;
    job_status: string;
    rating: number | null;
    created_at: string;
  }>;
}

function roundAverageRating(avg: number | null): number | null {
  return avg != null ? Math.round(avg * 100) / 100 : null;
}

export async function getAgentRatingsByAgentIdTurso(agentId: number) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT rating, created_at FROM submissions WHERE agent_id = ? AND rating IS NOT NULL AND rating > 0 ORDER BY created_at DESC",
    args: [agentId],
  });
  const submissions = rowsToObjects(result.rows) as { rating: number; created_at: string }[];
  const ratings = submissions.map(s => s.rating);
  const rawAverage = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
  return {
    ratings,
    average: roundAverageRating(rawAverage),
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

export async function getAgentRatingsByUsernameTurso(usernameLower: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT rating, created_at FROM submissions WHERE agent_username IS NOT NULL AND LOWER(agent_username) = ? AND rating IS NOT NULL AND rating > 0 ORDER BY created_at DESC",
    args: [usernameLower],
  });
  const submissions = rowsToObjects(result.rows) as { rating: number; created_at: string }[];
  const ratings = submissions.map(s => s.rating);
  const rawAverage = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
  return {
    ratings,
    average: roundAverageRating(rawAverage),
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

export async function getHumanRatingsByHumanIdTurso(humanId: number) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: "SELECT rating, created_at FROM submissions WHERE human_id = ? AND rating IS NOT NULL AND rating > 0 ORDER BY created_at DESC",
    args: [humanId],
  });
  const submissions = rowsToObjects(result.rows) as { rating: number; created_at: string }[];
  const ratings = submissions.map(s => s.rating);
  const rawAverage = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
  return {
    ratings,
    average: roundAverageRating(rawAverage),
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

export async function listHumanSubmissionsByHumanIdTurso(humanId: number): Promise<Array<{
  submission_id: number;
  job_id: number;
  description: string;
  amount: number;
  chain: string;
  job_status: string;
  rating: number | null;
  created_at: string;
}>> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");
  const result = await client.execute({
    sql: `SELECT s.id as submission_id, j.id as job_id, j.description, j.amount, j.chain, j.status as job_status, s.rating, s.created_at
       FROM submissions s
       JOIN jobs j ON s.job_id = j.id
       WHERE s.human_id = ?
       ORDER BY s.created_at DESC`,
    args: [humanId],
  });
  return rowsToObjects(result.rows) as Array<{
    submission_id: number;
    job_id: number;
    description: string;
    amount: number;
    chain: string;
    job_status: string;
    rating: number | null;
    created_at: string;
  }>;
}

export type TopAgentRow = {
  agent_wallet: string;
  agent_username: string | null;
  average_rating: number;
  total_rated: number;
};

export async function listTopRatedAgentsTurso(limit: number = 50) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: `SELECT agent_wallet, MAX(agent_username) as agent_username, AVG(rating) as average_rating, COUNT(*) as total_rated
          FROM submissions
          WHERE rating IS NOT NULL AND rating > 0 AND agent_id IS NOT NULL
          GROUP BY agent_wallet
          ORDER BY average_rating DESC, total_rated DESC
          LIMIT ?`,
    args: [limit],
  });

  return rowsToObjects(result.rows) as TopAgentRow[];
}

export type TopHumanRow = {
  human_id: number;
  display_name: string;
  average_rating: number;
  total_rated: number;
};

export async function listTopRatedHumansTurso(limit: number = 50) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: `SELECT s.human_id, h.display_name, AVG(s.rating) as average_rating, COUNT(*) as total_rated
          FROM submissions s
          JOIN humans h ON h.id = s.human_id
          WHERE s.rating IS NOT NULL AND s.rating > 0 AND s.human_id IS NOT NULL
          GROUP BY s.human_id, h.display_name
          ORDER BY average_rating DESC, total_rated DESC
          LIMIT ?`,
    args: [limit],
  });

  return rowsToObjects(result.rows) as TopHumanRow[];
}

export type NetWorthLeaderboardRow = {
  username: string;
  total_verified_balance: number;
};

export async function getNetWorthLeaderboardTurso(limit: number = 50): Promise<NetWorthLeaderboardRow[]> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: `SELECT a.username_display as username, COALESCE(SUM(ab.verified_balance), 0) as total_verified_balance
          FROM agents a
          LEFT JOIN agent_balances ab ON ab.agent_id = a.id
          GROUP BY a.id, a.username_display
          HAVING COALESCE(SUM(ab.verified_balance), 0) > 0
          ORDER BY total_verified_balance DESC
          LIMIT ?`,
    args: [limit],
  });

  return rowsToObjects(result.rows) as NetWorthLeaderboardRow[];
}

export async function createDepositTurso(params: {
  walletAddress: string;
  amount: number;
  chain: string;
  transactionHash?: string | null;
  status?: string;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const existingResult = await client.execute({
    sql: "SELECT * FROM deposits WHERE wallet_address = ? AND chain = ?",
    args: [params.walletAddress, params.chain],
  });
  const existing = rowToObject(existingResult.rows[0]);

  if (existing) {
    const newBalance = existing.balance + params.amount;
    const newVerifiedBalance = existing.verified_balance + params.amount;
    
    await client.execute({
      sql: `UPDATE deposits 
            SET amount = amount + ?, 
                balance = ?,
                verified_balance = ?,
                transaction_hash = COALESCE(?, transaction_hash),
                status = ?,
                created_at = ?
            WHERE wallet_address = ? AND chain = ?`,
      args: [
        params.amount,
        newBalance,
        newVerifiedBalance,
        params.transactionHash ?? null,
        params.status || "confirmed",
        new Date().toISOString(),
        params.walletAddress,
        params.chain
      ],
    });
    
    const agent = await getAgentByWalletTurso(params.walletAddress, params.chain);
    if (agent) await creditAgentVerifiedTurso(agent.id, params.chain, params.amount);
    return {
      id: existing.id,
      created_at: existing.created_at
    };
  } else {
    const createdAt = new Date().toISOString();
    const result = await client.execute({
      sql: `INSERT INTO deposits (wallet_address, amount, chain, transaction_hash, status, balance, verified_balance, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        params.walletAddress,
        params.amount,
        params.chain,
        params.transactionHash ?? null,
        params.status || "confirmed",
        params.amount,
        params.amount,
        createdAt
      ],
    });

    const agent = await getAgentByWalletTurso(params.walletAddress, params.chain);
    if (agent) await creditAgentVerifiedTurso(agent.id, params.chain, params.amount);
    return {
      id: Number(result.lastInsertRowid),
      created_at: createdAt
    };
  }
}

export async function getDepositTurso(walletAddress: string, chain: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  if (walletAddress.startsWith("moltybounty:")) {
    const agentId = parseInt(walletAddress.slice("moltybounty:".length), 10);
    if (Number.isInteger(agentId)) {
      const balances = await getAgentBalancesTurso(agentId, chain);
      return {
        id: 0,
        wallet_address: walletAddress,
        amount: balances.verified_balance,
        chain,
        transaction_hash: null,
        status: "confirmed",
        balance: balances.balance,
        pending_balance: balances.pending_balance,
        verified_balance: balances.verified_balance,
        created_at: new Date().toISOString(),
      };
    }
  }
  const agent = await getAgentByWalletTurso(walletAddress, chain);
  if (agent) {
    const balances = await getAgentBalancesTurso(agent.id, chain);
    return {
      id: 0,
      wallet_address: walletAddress,
      amount: balances.verified_balance,
      chain,
      transaction_hash: null,
      status: "confirmed",
      balance: balances.balance,
      pending_balance: balances.pending_balance,
      verified_balance: balances.verified_balance,
      created_at: new Date().toISOString(),
    };
  }

  const result = await client.execute({
    sql: "SELECT * FROM deposits WHERE wallet_address = ? AND chain = ?",
    args: [walletAddress, chain],
  });

  return rowToObject(result.rows[0]);
}

export async function getWalletBalanceTurso(walletAddress: string, chain: string): Promise<number> {
  const deposit = await getDepositTurso(walletAddress, chain);
  return deposit ? deposit.balance : 0;
}

export async function getWalletBalancesTurso(walletAddress: string, chain: string) {
  const deposit = await getDepositTurso(walletAddress, chain);
  return deposit ? {
    balance: deposit.balance,
    pending_balance: deposit.pending_balance,
    verified_balance: deposit.verified_balance
  } : { balance: 0, pending_balance: 0, verified_balance: 0 };
}

export async function listDepositsTurso(walletAddress?: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  let result;
  if (walletAddress) {
    result = await client.execute({
      sql: "SELECT * FROM deposits WHERE wallet_address = ? ORDER BY created_at DESC",
      args: [walletAddress],
    });
  } else {
    result = await client.execute({
      sql: "SELECT * FROM deposits ORDER BY created_at DESC",
      args: [],
    });
  }

  return rowsToObjects(result.rows);
}

/** Deduct from agent's verified balance (for withdrawals when user is identified by username). */
export async function processWithdrawalByAgentTurso(
  agentId: number,
  chain: string,
  amount: number
): Promise<{ success: boolean; error?: string; newBalance?: number; newVerifiedBalance?: number }> {
  const balances = await getAgentBalancesTurso(agentId, chain);
  if (balances.verified_balance < amount) {
    return { success: false, error: `Insufficient verified balance. Available: ${balances.verified_balance}, Requested: ${amount}` };
  }
  const MINIMUM_BALANCE = 0.01;
  const newBalance = balances.balance - amount;
  const newVerifiedBalance = balances.verified_balance - amount;
  if (newBalance < MINIMUM_BALANCE) {
    return {
      success: false,
      error: `Withdrawal would bring balance below minimum required (${MINIMUM_BALANCE} ${chain}). Current balance: ${balances.balance}, After withdrawal: ${newBalance}`,
    };
  }
  const debitResult = await debitAgentVerifiedTurso(agentId, chain, amount);
  if (!debitResult.success) return { success: false, error: debitResult.error };
  return { success: true, newBalance, newVerifiedBalance };
}

export async function processWithdrawalTurso(
  walletAddress: string,
  chain: string,
  amount: number
): Promise<{ success: boolean; error?: string; newBalance?: number; newVerifiedBalance?: number }> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const deposit = await getDepositTurso(walletAddress, chain);
  if (!deposit) {
    return { success: false, error: "No deposit found for this wallet and chain." };
  }

  if (deposit.verified_balance < amount) {
    return { success: false, error: `Insufficient verified balance. Available: ${deposit.verified_balance}, Requested: ${amount}` };
  }

  const MINIMUM_BALANCE = 0.01;
  const newBalance = deposit.balance - amount;
  const newVerifiedBalance = deposit.verified_balance - amount;

  if (newBalance < MINIMUM_BALANCE) {
    return { 
      success: false, 
      error: `Withdrawal would bring balance below minimum required (${MINIMUM_BALANCE} ${chain}). Current balance: ${deposit.balance}, After withdrawal: ${newBalance}` 
    };
  }

  await client.execute({
    sql: "UPDATE deposits SET verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
    args: [newVerifiedBalance, newBalance, walletAddress, chain],
  });

  return {
    success: true,
    newBalance,
    newVerifiedBalance
  };
}

export async function createWithdrawalTurso(params: {
  walletAddress: string;
  amount: number;
  chain: string;
  destinationWallet?: string | null;
  transactionHash?: string | null;
  status?: string;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const createdAt = new Date().toISOString();
  const result = await client.execute({
    sql: `INSERT INTO withdrawals (wallet_address, amount, chain, destination_wallet, transaction_hash, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      params.walletAddress,
      params.amount,
      params.chain,
      params.destinationWallet ?? null,
      params.transactionHash ?? null,
      params.status || "pending",
      createdAt
    ],
  });

  return {
    id: Number(result.lastInsertRowid),
    created_at: createdAt
  };
}

export async function listWithdrawalsTurso(walletAddress?: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  let result;
  if (walletAddress) {
    result = await client.execute({
      sql: "SELECT * FROM withdrawals WHERE wallet_address = ? ORDER BY created_at DESC",
      args: [walletAddress],
    });
  } else {
    result = await client.execute({
      sql: "SELECT * FROM withdrawals ORDER BY created_at DESC",
      args: [],
    });
  }

  return rowsToObjects(result.rows);
}

export async function updateJobStatusTurso(jobId: number, status: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  await client.execute({
    sql: "UPDATE jobs SET status = ? WHERE id = ?",
    args: [status, jobId],
  });
}

export async function getPosterPaymentTurso(jobId: number) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: "SELECT * FROM poster_payments WHERE job_id = ?",
    args: [jobId],
  });

  return rowToObject(result.rows[0]);
}

export async function returnPosterCollateralTurso(jobId: number, chain: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const payment = await getPosterPaymentTurso(jobId);
  if (!payment || payment.collateral_returned) {
    return false;
  }

  if (payment.poster_wallet.startsWith("moltybounty:")) {
    const agentId = parseInt(payment.poster_wallet.slice("moltybounty:".length), 10);
    if (Number.isInteger(agentId)) {
      await creditAgentVerifiedTurso(agentId, chain, payment.collateral_amount);
      await client.execute({
        sql: "UPDATE poster_payments SET collateral_returned = 1, returned_at = ? WHERE job_id = ?",
        args: [new Date().toISOString(), jobId],
      });
      return true;
    }
  }

  const posterDeposit = await getDepositTurso(payment.poster_wallet, chain);
  
  if (posterDeposit) {
    const newVerifiedBalance = posterDeposit.verified_balance + payment.collateral_amount;
    const newBalance = posterDeposit.balance + payment.collateral_amount;
    await client.execute({
      sql: "UPDATE deposits SET verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
      args: [newVerifiedBalance, newBalance, payment.poster_wallet, chain],
    });
  } else {
    await createDepositTurso({
      walletAddress: payment.poster_wallet,
      amount: payment.collateral_amount,
      chain: chain,
      status: "confirmed"
    });
    await client.execute({
      sql: "UPDATE deposits SET verified_balance = balance WHERE wallet_address = ? AND chain = ?",
      args: [payment.poster_wallet, chain],
    });
  }
  
  await client.execute({
    sql: "UPDATE poster_payments SET collateral_returned = 1, returned_at = ? WHERE job_id = ?",
    args: [new Date().toISOString(), jobId],
  });
  
  return true;
}

export async function checkAndApplyLateRatingPenaltiesTurso() {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const now = new Date().toISOString();
  // For humans: include submissions that are past deadline AND (not rated OR rated < 2)
  // This ensures humans get auto-verified after 24 hours even if rated < 2 stars
  const result = await client.execute({
    sql: `
      SELECT s.id, s.job_id, s.agent_wallet, s.agent_id, s.human_id, s.rating_deadline, s.rating, j.chain, j.poster_wallet, j.amount
      FROM submissions s
      JOIN jobs j ON s.job_id = j.id
      WHERE s.rating_deadline < ? AND (
        (s.rating IS NULL) OR 
        (s.human_id IS NOT NULL AND s.rating < 2)
      )
    `,
    args: [now],
  });

  const lateSubmissions = rowsToObjects(result.rows) as Array<{
    id: number;
    job_id: number;
    agent_wallet: string;
    agent_id: number | null;
    human_id: number | null;
    rating_deadline: string;
    rating: number | null;
    chain: string;
    poster_wallet: string | null;
    amount: number;
  }>;

  for (const sub of lateSubmissions) {
    if (sub.amount > 0) {
      if (sub.human_id != null) {
        // For humans: automatically move pending to verified after 24 hours
        // This applies even if rated < 2 stars (we restore the deducted amount)
        const humanBalances = await getHumanBalancesTurso(sub.human_id, sub.chain);
        const pendingToMove = Math.min(humanBalances.pending_balance, sub.amount);
        const amountToAdd = sub.amount; // Always add the full amount to verified
        
        // Deduct from pending (may be less than amount if already deducted)
        const newPending = Math.max(0, humanBalances.pending_balance - sub.amount);
        // Add full amount to verified (restores if it was deducted)
        const newVerified = humanBalances.verified_balance + amountToAdd;
        // Adjust total balance: subtract what we removed from pending, add to verified
        const newBalance = humanBalances.balance - pendingToMove + amountToAdd;
        const now = new Date().toISOString();
        await client.execute({
          sql: "UPDATE human_balances SET pending_balance = ?, verified_balance = ?, balance = ?, updated_at = ? WHERE human_id = ? AND chain = ?",
          args: [newPending, newVerified, newBalance, now, sub.human_id, sub.chain.trim().toLowerCase()],
        });
      } else if (sub.agent_id != null) {
        await moveAgentPendingToVerifiedTurso(sub.agent_id, sub.chain, sub.amount);
      } else {
        const agentDeposit = await getDepositTurso(sub.agent_wallet, sub.chain);
        if (agentDeposit) {
          const newPendingBalance = Math.max(0, agentDeposit.pending_balance - sub.amount);
          const newVerifiedBalance = agentDeposit.verified_balance + sub.amount;
          const newBalance = newVerifiedBalance + newPendingBalance;
          await client.execute({
            sql: "UPDATE deposits SET pending_balance = ?, verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
            args: [newPendingBalance, newVerifiedBalance, newBalance, sub.agent_wallet, sub.chain],
          });
        }
      }
    }
    // Mark as auto-verified (rating = 0) if not already rated
    if (sub.rating === null) {
      await client.execute({
        sql: "UPDATE submissions SET rating = 0 WHERE id = ?",
        args: [sub.id],
      });
    }
  }

  return lateSubmissions.length;
}

export async function deleteJobTurso(privateId: string, posterWallet: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  // Get the job
  const jobResult = await client.execute({
    sql: "SELECT * FROM jobs WHERE private_id = ?",
    args: [privateId],
  });

  const job = rowToObject(jobResult.rows[0]);
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
  const paymentResult = await client.execute({
    sql: "SELECT * FROM poster_payments WHERE job_id = ?",
    args: [job.id],
  });
  const payment = rowToObject(paymentResult.rows[0]);

  // Return collateral to poster if payment exists and collateral hasn't been returned
  if (payment && !payment.collateral_returned) {
    const posterDeposit = await getDepositTurso(payment.poster_wallet, job.chain);
    
    if (posterDeposit) {
      const newVerifiedBalance = posterDeposit.verified_balance + payment.collateral_amount;
      const newBalance = posterDeposit.balance + payment.collateral_amount;
      await client.execute({
        sql: "UPDATE deposits SET verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
        args: [newVerifiedBalance, newBalance, payment.poster_wallet, job.chain],
      });
    } else {
      // Create deposit record for poster if they don't have one
      await createDepositTurso({
        walletAddress: payment.poster_wallet,
        amount: payment.collateral_amount,
        chain: job.chain,
        status: "confirmed"
      });
      await client.execute({
        sql: "UPDATE deposits SET verified_balance = balance WHERE wallet_address = ? AND chain = ?",
        args: [payment.poster_wallet, job.chain],
      });
    }
  }

  // Delete poster payment record
  await client.execute({
    sql: "DELETE FROM poster_payments WHERE job_id = ?",
    args: [job.id],
  });

  // Delete the job
  await client.execute({
    sql: "DELETE FROM jobs WHERE id = ?",
    args: [job.id],
  });

  return {
    success: true,
    message: `Bounty deleted successfully. ${payment && !payment.collateral_returned ? `Collateral (${payment.collateral_amount} ${job.chain}) has been returned to your wallet.` : ""}`,
    collateral_returned: payment && !payment.collateral_returned ? payment.collateral_amount : 0
  };
}
