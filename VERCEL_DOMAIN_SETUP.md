# Setting Up Domain in Vercel

## Step-by-Step Guide for claw-job.com

### Step 1: Access Domain Settings

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Sign in if needed

2. **Select Your Project**
   - Click on your `claw-job` project (or whatever you named it)

3. **Go to Settings**
   - Click on the **"Settings"** tab at the top

4. **Navigate to Domains**
   - Click **"Domains"** in the left sidebar

### Step 2: Add Your Domain

1. **Add Domain**
   - In the "Domains" section, you'll see an input field
   - Enter: `claw-job.com`
   - Click **"Add"** or press Enter

2. **Add www Subdomain (Optional but Recommended)**
   - Also add: `www.claw-job.com`
   - This allows users to access via both `claw-job.com` and `www.claw-job.com`

### Step 3: Configure DNS Records

Vercel will show you DNS configuration instructions. You need to update your domain's DNS settings at your domain registrar (where you bought the domain).

#### Option A: Using CNAME (Recommended)

**For the root domain (claw-job.com):**
- **Type**: `CNAME` or `ALIAS` (some registrars call it ALIAS)
- **Name**: `@` (or leave blank, or `claw-job.com`)
- **Value**: `cname.vercel-dns.com`
- **TTL**: `3600` (or default)

**For www subdomain:**
- **Type**: `CNAME`
- **Name**: `www`
- **Value**: `cname.vercel-dns.com`
- **TTL**: `3600` (or default)

#### Option B: Using A Records (Alternative)

If your registrar doesn't support CNAME for root domain:

**For the root domain:**
- **Type**: `A`
- **Name**: `@` (or leave blank)
- **Value**: `76.76.21.21` (Vercel's IP - check Vercel dashboard for current IP)
- **TTL**: `3600`

**For www subdomain:**
- **Type**: `CNAME`
- **Name**: `www`
- **Value**: `cname.vercel-dns.com`
- **TTL**: `3600`

### Step 4: Update DNS at Your Registrar

1. **Log into your domain registrar**
   - Where you bought `claw-job.com` (e.g., Namecheap, GoDaddy, Google Domains, etc.)

2. **Find DNS Management**
   - Look for "DNS Settings", "DNS Management", or "Name Servers"

3. **Add/Update Records**
   - Add the CNAME or A records as shown above
   - Save changes

### Step 5: Wait for DNS Propagation

- DNS changes can take **5 minutes to 48 hours** to propagate
- Usually takes **15-60 minutes** in most cases
- You can check status at: https://dnschecker.org

### Step 6: Verify in Vercel

1. **Check Domain Status**
   - Go back to Vercel → Your Project → Settings → Domains
   - You'll see the status:
     - 🟡 **Pending** - DNS is propagating
     - 🟢 **Valid** - Domain is configured correctly
     - 🔴 **Invalid** - Check DNS settings

2. **SSL Certificate**
   - Vercel automatically provisions SSL certificates (HTTPS)
   - This happens automatically once DNS is valid
   - Usually takes a few minutes after DNS is valid

### Step 7: Test Your Domain

Once DNS is valid and SSL is provisioned:

1. **Visit your site**: `https://claw-job.com`
2. **Test www**: `https://www.claw-job.com`
3. **Check API**: `https://claw-job.com/api/config`

## Common Issues & Solutions

### Domain Shows "Invalid Configuration"

**Possible causes:**
- DNS records not added correctly
- Wrong record type (should be CNAME or A)
- Wrong value (should be `cname.vercel-dns.com`)

**Solution:**
- Double-check DNS records at your registrar
- Wait a bit longer for DNS propagation
- Use https://dnschecker.org to verify DNS propagation globally

### SSL Certificate Not Provisioning

**Possible causes:**
- DNS not fully propagated yet
- Domain not pointing to Vercel correctly

**Solution:**
- Wait 10-30 minutes after DNS is valid
- Vercel will automatically retry SSL provisioning
- Check Vercel dashboard for SSL status

### Domain Takes Too Long to Verify

**Solution:**
- DNS propagation can take up to 48 hours (rare)
- Check DNS propagation: https://dnschecker.org
- Verify records are correct at your registrar

## Quick Reference

**Vercel Dashboard**: https://vercel.com/dashboard
**Domain Settings**: Project → Settings → Domains
**DNS Checker**: https://dnschecker.org
**Vercel Support**: https://vercel.com/support

## After Setup

Once your domain is working:

1. ✅ Update `CLAW_JOB_BASE_URL` in your environment variables to `https://claw-job.com`
2. ✅ Test all endpoints
3. ✅ Update documentation with the production URL
4. ✅ Share your domain with users!
