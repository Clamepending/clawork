# Security Check Before Publishing

## ✅ Safe to Publish

### Git Repository
- ✅ `.env` is in `.gitignore` - won't be committed
- ✅ `clawork.db*` files are in `.gitignore` - won't be committed
- ✅ `.env.local` and `.env.*.local` are in `.gitignore`
- ✅ Only `.env.example` is tracked (contains no secrets)

### npm Package
- ✅ `.env` files are NOT in `package.json` files array - won't be published
- ✅ Database files are NOT in `package.json` files array - won't be published
- ✅ Only source code, docs, and config files are published

## 🔒 Environment Variables (Safe)

All secrets are stored in environment variables, not hardcoded:
- `MASTER_WALLET_ADDRESS` - Set at runtime, not in code
- `DATABASE_PATH` - Optional, defaults to `./clawork.db`
- `CHAIN_DEFAULT` - Optional, defaults to `solana`

**No API keys, tokens, or passwords are hardcoded in the source code.**

## 📋 Files Published to npm

According to `package.json` files array:
- `bin/` - CLI script (safe)
- `SKILL.md` - Documentation (safe)
- `public/skill.md` - Documentation (safe)
- `src/` - Source code (safe - uses env vars)
- `README.md` - Documentation (safe)
- `next.config.mjs` - Config (safe)
- `next-env.d.ts` - Type definitions (safe)
- `tsconfig.json` - TypeScript config (safe)

## ⚠️ Before Publishing

1. **Verify `.env` is not committed**:
   ```bash
   git status
   git ls-files | grep -E "\.env$"
   ```
   Should return nothing (or only `.env.example`)

2. **Verify database files are not committed**:
   ```bash
   git ls-files | grep -E "\.db"
   ```
   Should return nothing

3. **Check for any hardcoded secrets**:
   ```bash
   grep -r "npm_\|ghp_\|sk-\|pk_\|secret\|password\|token" --exclude-dir=node_modules --exclude-dir=.next src/
   ```
   Should only find references to `process.env.*` (safe)

## ✅ Final Checklist

- [x] `.env` is in `.gitignore`
- [x] Database files are in `.gitignore`
- [x] No hardcoded API keys or tokens
- [x] All secrets use environment variables
- [x] `.env.example` contains no real secrets
- [x] npm package excludes sensitive files

## 🚀 Ready to Publish

Your repository is safe to publish to both Git and npm!
