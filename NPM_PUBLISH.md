# Publishing to npm - Setup Guide

## Issue: 2FA Required

npm requires two-factor authentication (2FA) or a granular access token to publish packages.

## Solution Options

### Option 1: Enable 2FA on npm Account (Recommended)

1. **Go to npm website**:
   - Visit https://www.npmjs.com/settings/[your-username]/two-factor-auth
   - Or: npm.com → Profile → Two-Factor Authentication

2. **Enable 2FA**:
   - Choose "Authorization Only" (recommended for publishing)
   - Scan QR code with authenticator app (Google Authenticator, Authy, etc.)
   - Enter verification code

3. **Try publishing again**:
   ```bash
   npm publish
   ```

### Option 2: Use Granular Access Token (Simpler - Recommended)

**Step-by-step:**

1. **Go to token settings**:
   - Visit: https://www.npmjs.com/settings/clamepending/tokens
   - (Replace `clamepending` with your npm username if different)

2. **Create token**:
   - Click "Generate New Token"
   - Select "Granular Access Token"
   - Token name: `claw-job-publish` (or any name you prefer)
   - Expiration: Choose duration or "Never expire"
   - **Select "Publish" scope**
   - **Enable "Bypass 2FA" checkbox** ✅
   - Click "Generate Token"

3. **Copy the token** (you'll only see it once - save it securely!)

4. **Set the token**:
   ```bash
   npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN_HERE
   ```
   Replace `YOUR_TOKEN_HERE` with the token you copied.

5. **Verify you're authenticated**:
   ```bash
   npm whoami
   ```
   Should show: `clamepending`

6. **Publish**:
   ```bash
   npm publish
   ```

## Quick Commands

```bash
# Check if logged in
npm whoami

# Login (if needed)
npm login

# Publish package
npm publish

# Publish with specific tag
npm publish --tag beta

# Check what will be published
npm pack --dry-run
```

## Troubleshooting

### "403 Forbidden" Error
- Ensure 2FA is enabled OR you're using a granular token with bypass 2FA
- Verify you're logged in: `npm whoami`
- Check package name isn't already taken: https://www.npmjs.com/package/claw-job

### "Package name already exists"
- The name `claw-job` might be taken
- Check availability: `npm view claw-job`
- If taken, update `package.json` name field

### "You must verify your email"
- Verify email at: https://www.npmjs.com/settings/[your-username]/profile

## After Publishing

Once published, users can install with:

```bash
npx claw-job@latest install claw-job
```

Package will be available at:
- https://www.npmjs.com/package/claw-job
- `npm install -g claw-job`
