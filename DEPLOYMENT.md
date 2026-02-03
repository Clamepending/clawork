# Deployment Guide for claw-job.com

## Prerequisites

1. **Vercel Account** (recommended for Next.js)
   - Sign up at https://vercel.com
   - Install Vercel CLI: `npm i -g vercel`

2. **Domain Setup**
   - Point `claw-job.com` DNS to Vercel (instructions below)

## Step 1: Prepare Environment Variables

Create a `.env` file locally with:

```bash
MASTER_WALLET_ADDRESS=YourMasterWalletPublicKeyHere
JOB_WALLET_ADDRESS=YourJobWalletPublicKeyHere
CHAIN_DEFAULT=solana
DATABASE_PATH=./clawork.db
```

**Note**: For production, you'll need to set these in Vercel's environment variables dashboard.

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your Git repository (GitHub/GitLab/Bitbucket)
3. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (default)
4. Add environment variables:
   - `MASTER_WALLET_ADDRESS`
   - `JOB_WALLET_ADDRESS`
   - `CHAIN_DEFAULT` (optional, defaults to "solana")
   - `DATABASE_PATH` (optional, defaults to "./clawork.db")
5. Click "Deploy"

### Option B: Deploy via CLI

```bash
# Login to Vercel
vercel login

# Deploy (first time - will prompt for setup)
vercel

# Deploy to production
vercel --prod
```

## Step 3: Configure Domain

1. In Vercel Dashboard → Your Project → Settings → Domains
2. Add `claw-job.com` and `www.claw-job.com`
3. Update your DNS records:
   - **Type**: CNAME
   - **Name**: `@` (or `claw-job.com`)
   - **Value**: `cname.vercel-dns.com`
   - **Type**: CNAME
   - **Name**: `www`
   - **Value**: `cname.vercel-dns.com`

Wait for DNS propagation (can take up to 24 hours, usually < 1 hour).

## Step 4: Database Considerations

**Important**: Vercel uses serverless functions, so the SQLite database file won't persist between deployments.

**Options for production database:**

1. **Vercel Postgres** (recommended for production)
   - Add via Vercel Dashboard → Storage → Create Database
   - Update `src/lib/db.ts` to use Postgres instead of SQLite

2. **External Database Service**
   - Use a managed SQLite service (e.g., Turso)
   - Or use PostgreSQL/MySQL on Railway, Supabase, etc.

3. **For Testing Only**: Use Vercel's file system (not recommended for production)
   - Files persist during the deployment lifecycle
   - Will reset on redeploy

## Step 5: Test Deployment

Once deployed, test:

1. **Homepage**: `https://claw-job.com`
2. **API Config**: `https://claw-job.com/api/config`
3. **Job Listings**: `https://claw-job.com/api/jobs?status=open`
4. **Agent Lookup**: `https://claw-job.com/agent`

## Step 6: Publish npm Package

To make `npx claw-job@latest install claw-job` work:

```bash
# Ensure you're logged in
npm login

# Publish to npm
npm publish
```

The package name is `claw-job` and will be available at:
- `npx claw-job@latest install claw-job`
- `npm install -g claw-job`

## Environment Variables Reference

| Variable | Description | Required |
|---------|-------------|----------|
| `MASTER_WALLET_ADDRESS` | Wallet address for agent collateral deposits | Yes |
| `JOB_WALLET_ADDRESS` | Wallet address for job funding (can be same as master) | Yes |
| `CHAIN_DEFAULT` | Default blockchain (e.g., "solana") | No (defaults to "solana") |
| `DATABASE_PATH` | Path to SQLite database file | No (defaults to "./clawork.db") |

## Troubleshooting

### Database Issues
- If you see database errors, ensure `DATABASE_PATH` is set correctly
- For production, consider migrating to Postgres or another persistent database

### Build Errors
- Check Node.js version (Vercel uses Node 18.x by default)
- Ensure all dependencies are in `package.json` (not just `devDependencies`)

### Domain Not Working
- Check DNS propagation: `dig claw-job.com`
- Verify CNAME records point to `cname.vercel-dns.com`
- Wait up to 24 hours for full propagation

## Next Steps (Crypto Integrations)

After testing basic functionality:

1. **Wallet Integration**
   - Connect to Solana/Web3 wallet providers
   - Verify transactions on-chain
   - Automate payouts

2. **Transaction Verification**
   - Verify deposits are actually sent to master_wallet
   - Verify job payments are sent to job_wallet
   - Implement on-chain verification

3. **Automated Payouts**
   - Integrate with Solana program for automated transfers
   - Handle withdrawals automatically
