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
}

// Generate secure private ID
function generatePrivateId(): string {
  const bytes = randomBytes(36);
  return bytes.toString("base64url");
}

// Database operations using Turso HTTP API
export async function createJobTurso(params: {
  description: string;
  amount: number;
  chain: string;
  posterWallet: string;
  masterWallet: string;
  jobWallet: string;
  transactionHash?: string | null;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const privateId = generatePrivateId();
  const collateralAmount = 0.001;
  const totalPaid = params.amount + collateralAmount;
  const createdAt = new Date().toISOString();

  // Insert job
  const jobResult = await client.execute({
    sql: `INSERT INTO jobs (private_id, description, amount, chain, poster_wallet, master_wallet, job_wallet, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    args: [
      privateId,
      params.description,
      params.amount,
      params.chain,
      params.posterWallet,
      params.masterWallet,
      params.jobWallet,
      createdAt
    ],
  });

  const jobId = Number(jobResult.lastInsertRowid);

  // Insert poster payment
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

  return {
    id: jobId,
    private_id: privateId,
    created_at: createdAt
  };
}

export async function listJobsTurso(status?: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  let result;
  if (status) {
    result = await client.execute({
      sql: "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC",
      args: [status],
    });
  } else {
    result = await client.execute({
      sql: "SELECT * FROM jobs ORDER BY created_at DESC",
      args: [],
    });
  }

  return rowsToObjects(result.rows);
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
  jobAmount: number;
  chain: string;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const createdAt = new Date().toISOString();
  const deadline = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const result = await client.execute({
    sql: `INSERT INTO submissions (job_id, response, agent_wallet, status, rating_deadline, created_at)
          VALUES (?, ?, ?, 'submitted', ?, ?)`,
    args: [
      params.jobId,
      params.response,
      params.agentWallet,
      deadline,
      createdAt
    ],
  });

  const submissionId = Number(result.lastInsertRowid);

  // Update agent's pending balance
  const deposit = await getDepositTurso(params.agentWallet, params.chain);
  if (deposit) {
    const newPendingBalance = deposit.pending_balance + params.jobAmount;
    const newBalance = deposit.balance + params.jobAmount;
    await client.execute({
      sql: "UPDATE deposits SET pending_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
      args: [newPendingBalance, newBalance, params.agentWallet, params.chain],
    });
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

  await client.execute({
    sql: "UPDATE submissions SET rating = ? WHERE id = ?",
    args: [rating, submissionId],
  });

  const deposit = await getDepositTurso(agentWallet, chain);
  if (!deposit) return;

  const submissionResult = await client.execute({
    sql: "SELECT rating_deadline, created_at FROM submissions WHERE id = ?",
    args: [submissionId],
  });
  const submission = rowToObject(submissionResult.rows[0]);
  
  const now = new Date();
  const deadline = submission ? new Date(submission.rating_deadline) : null;
  const isLate = deadline && now > deadline;

  if (isLate && posterWallet) {
    const posterDeposit = await getDepositTurso(posterWallet, chain);
    if (posterDeposit) {
      const latePenalty = 0.01;
      const newBalance = Math.max(0, posterDeposit.balance - latePenalty);
      await client.execute({
        sql: "UPDATE deposits SET balance = ? WHERE wallet_address = ? AND chain = ?",
        args: [newBalance, posterWallet, chain],
      });
    }
  }

  if (rating >= 3) {
    const newPendingBalance = Math.max(0, deposit.pending_balance - jobAmount);
    const newVerifiedBalance = deposit.verified_balance + jobAmount;
    const newBalance = newVerifiedBalance + newPendingBalance;
    
    await client.execute({
      sql: "UPDATE deposits SET pending_balance = ?, verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
      args: [newPendingBalance, newVerifiedBalance, newBalance, agentWallet, chain],
    });
  } else if (rating <= 2) {
    const penaltyAmount = 0.01;
    const newPendingBalance = Math.max(0, deposit.pending_balance - jobAmount);
    const newVerifiedBalance = Math.max(0, deposit.verified_balance - penaltyAmount);
    const newBalance = newVerifiedBalance + newPendingBalance;
    
    await client.execute({
      sql: "UPDATE deposits SET pending_balance = ?, verified_balance = ?, balance = ? WHERE wallet_address = ? AND chain = ?",
      args: [newPendingBalance, newVerifiedBalance, newBalance, agentWallet, chain],
    });
  }
}

export async function getAgentRatingsTurso(agentWallet: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const result = await client.execute({
    sql: "SELECT rating, created_at FROM submissions WHERE agent_wallet = ? AND rating IS NOT NULL ORDER BY created_at DESC",
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

export async function createDepositTurso(params: {
  walletAddress: string;
  amount: number;
  chain: string;
  transactionHash?: string | null;
  status?: string;
}) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

  const existing = await getDepositTurso(params.walletAddress, params.chain);
  
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

    return {
      id: Number(result.lastInsertRowid),
      created_at: createdAt
    };
  }
}

export async function getDepositTurso(walletAddress: string, chain: string) {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not initialized");

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
  const result = await client.execute({
    sql: `
      SELECT s.id, s.job_id, s.agent_wallet, s.rating_deadline, j.chain, j.poster_wallet, j.amount
      FROM submissions s
      JOIN jobs j ON s.job_id = j.id
      WHERE s.rating IS NULL AND s.rating_deadline < ?
    `,
    args: [now],
  });

  const lateSubmissions = rowsToObjects(result.rows) as Array<{
    id: number;
    job_id: number;
    agent_wallet: string;
    rating_deadline: string;
    chain: string;
    poster_wallet: string | null;
    amount: number;
  }>;
  
  for (const sub of lateSubmissions) {
    if (sub.poster_wallet) {
      const posterDeposit = await getDepositTurso(sub.poster_wallet, sub.chain);
      if (posterDeposit) {
        const latePenalty = 0.01;
        const newBalance = Math.max(0, posterDeposit.balance - latePenalty);
        await client.execute({
          sql: "UPDATE deposits SET balance = ? WHERE wallet_address = ? AND chain = ?",
          args: [newBalance, sub.poster_wallet, sub.chain],
        });
      }
    }
    await client.execute({
      sql: "UPDATE submissions SET rating = -1 WHERE id = ?",
      args: [sub.id],
    });
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
    return { success: false, error: "Job not found." };
  }

  // Verify poster wallet matches
  if (job.poster_wallet !== posterWallet) {
    return { success: false, error: "Unauthorized. Only the poster can delete this job." };
  }

  // Verify job is still open (not claimed)
  if (job.status !== "open") {
    return { success: false, error: `Cannot delete job. Job status is "${job.status}" (must be "open").` };
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
    message: `Job deleted successfully. ${payment && !payment.collateral_returned ? `Collateral (${payment.collateral_amount} ${job.chain}) has been returned to your wallet.` : ""}`,
    collateral_returned: payment && !payment.collateral_returned ? payment.collateral_amount : 0
  };
}
