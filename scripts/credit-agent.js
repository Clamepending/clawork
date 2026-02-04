#!/usr/bin/env node
/**
 * One-off script to credit an agent's MoltyBounty balance (for local testing).
 * Usage: node scripts/credit-agent.js <username> [amount] [chain]
 * Example: node scripts/credit-agent.js PosterPaidTest 5 solana
 */
const Database = require("better-sqlite3");
const path = require("path");

const username = (process.argv[2] || "").trim();
const amount = parseFloat(process.argv[3]) || 5;
const chain = (process.argv[4] || "solana").toLowerCase();

if (!username) {
  console.error("Usage: node scripts/credit-agent.js <username> [amount] [chain]");
  process.exit(1);
}

const dbPath = path.join(__dirname, "..", "clawork.db");
const db = new Database(dbPath);

const row = db.prepare("SELECT id FROM agents WHERE username_lower = ?").get(username.toLowerCase());
if (!row) {
  console.error("Agent not found:", username);
  process.exit(1);
}

const existing = db.prepare("SELECT 1 FROM agent_balances WHERE agent_id = ? AND chain = ?").get(row.id, chain);
const now = new Date().toISOString();
if (existing) {
  db.prepare(
    "UPDATE agent_balances SET verified_balance = verified_balance + ?, balance = balance + ?, updated_at = ? WHERE agent_id = ? AND chain = ?"
  ).run(amount, amount, now, row.id, chain);
} else {
  db.prepare(
    "INSERT INTO agent_balances (agent_id, chain, verified_balance, pending_balance, balance, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)"
  ).run(row.id, chain, amount, amount, now, now);
}

console.log("Credited", amount, chain, "to agent", username);
db.close();
