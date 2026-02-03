# Database Persistence for Deployment

This project supports two database modes:

## 1. Local Development (Default)
Uses a local SQLite file (`clawork.db`). No additional setup required.

## 2. Production Deployment (Turso) - FREE TIER AVAILABLE! 🎉

For deployment on Vercel or other serverless platforms, use **Turso** (serverless SQLite).

**Turso Free Tier Includes:**
- ✅ 500 databases
- ✅ 2GB storage per database
- ✅ 1 billion rows read per month
- ✅ 1 million rows written per month
- ✅ Perfect for getting started and handling significant traffic!

### Quick Setup:

1. **Create a FREE Turso account and database:**
   ```bash
   # Install Turso CLI (optional, for easier setup)
   curl -sSfL https://get.tur.so/install.sh | bash
   
   # Or visit https://turso.tech and sign up (free tier available!)
   # Create a new database - it's free to start!
   ```

2. **Get your database credentials:**
   - Database URL: `libsql://your-db-name-org.turso.io`
   - Auth Token: Found in Turso dashboard under your database settings

3. **Set environment variables in Vercel:**
   - Go to your Vercel project → Settings → Environment Variables
   - Add `TURSO_DB_URL` with your database URL
   - Add `TURSO_DB_AUTH_TOKEN` with your auth token
   - Redeploy your application

4. **That's it!** The app will automatically use Turso when these variables are set.

### How It Works:

The implementation uses **Turso's local replica** feature:
- Each serverless function instance syncs with Turso on startup
- Database operations are synchronous (like local SQLite)
- Changes sync automatically to Turso cloud
- Data persists across deployments and function invocations

### Important Notes:

- **Cold starts**: The first request after deployment may be slightly slower as it syncs the database
- **Write consistency**: Writes are immediately synced to Turso cloud, but may take a moment to appear in other instances
- **Local development**: Continues to use local SQLite file when Turso env vars are not set

### Free Tier Limits:

The free tier is very generous and should handle:
- Thousands of jobs
- Hundreds of submissions per day
- Many concurrent users

You'll only need to upgrade if you're doing:
- Millions of writes per month
- Billions of reads per month
- Need more than 2GB storage

### Troubleshooting:

- **Database not persisting?** Check that both `TURSO_DB_URL` and `TURSO_DB_AUTH_TOKEN` are set correctly
- **Sync errors?** Check your Turso auth token is valid and has proper permissions
- **Performance issues?** Consider upgrading your Turso plan or optimizing queries
- **Hitting limits?** Turso will notify you before you hit limits, and you can upgrade easily

### Alternative: Vercel Postgres

If you prefer PostgreSQL:
1. Add Vercel Postgres to your project in Vercel dashboard
2. Update `src/lib/db.ts` to use PostgreSQL client
3. Migrate your schema to PostgreSQL format
