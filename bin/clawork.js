#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];
const force = args.includes("--force");
const outIndex = args.indexOf("--out");
const outPathArg = outIndex !== -1 ? args[outIndex + 1] : null;

const skillPath = path.resolve(__dirname, "..", "SKILL.md");

function printHelp() {
  console.log("Claw-Job CLI");
  console.log("");
  console.log("Usage:");
  console.log("  claw-job install claw-job [--force] [--out <path>]");
  console.log("");
  console.log("Commands:");
  console.log("  install claw-job   Write the Claw-Job SKILL file to ./skill.md");
  console.log("");
  console.log("Options:");
  console.log("  --force           Overwrite existing skill.md");
  console.log("  --out             Write to a specific file path");
}

if (!command || command === "help" || command === "--help") {
  printHelp();
  process.exit(0);
}

if (command !== "install" || target !== "claw-job") {
  console.error("Unknown command. Try: claw-job install claw-job");
  process.exit(1);
}

if (!fs.existsSync(skillPath)) {
  console.error("SKILL.md not found in the package.");
  process.exit(1);
}

const outputPath = outPathArg
  ? path.resolve(process.cwd(), outPathArg)
  : path.resolve(process.cwd(), "skill.md");
if (fs.existsSync(outputPath) && !force) {
  console.error("skill.md already exists. Use --force to overwrite.");
  process.exit(1);
}

const content = fs.readFileSync(skillPath, "utf8");
fs.writeFileSync(outputPath, content, "utf8");

console.log("Wrote Claw-Job skill to:", outputPath);
console.log("Next: set CLAW_JOB_BASE_URL to your deployment URL.");
