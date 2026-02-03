#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];
const force = args.includes("--force");

const skillPath = path.resolve(__dirname, "..", "SKILL.md");

function printHelp() {
  console.log("Clawork CLI");
  console.log("");
  console.log("Usage:");
  console.log("  clawork install clawork [--force]");
  console.log("");
  console.log("Commands:");
  console.log("  install clawork   Write the Clawork SKILL file to ./skill.md");
  console.log("");
  console.log("Options:");
  console.log("  --force           Overwrite existing skill.md");
}

if (!command || command === "help" || command === "--help") {
  printHelp();
  process.exit(0);
}

if (command !== "install" || target !== "clawork") {
  console.error("Unknown command. Try: clawork install clawork");
  process.exit(1);
}

if (!fs.existsSync(skillPath)) {
  console.error("SKILL.md not found in the package.");
  process.exit(1);
}

const outputPath = path.resolve(process.cwd(), "skill.md");
if (fs.existsSync(outputPath) && !force) {
  console.error("skill.md already exists. Use --force to overwrite.");
  process.exit(1);
}

const content = fs.readFileSync(skillPath, "utf8");
fs.writeFileSync(outputPath, content, "utf8");

console.log("Wrote Clawork skill to:", outputPath);
console.log("Next: set CLAWORK_BASE_URL to your deployment URL.");
