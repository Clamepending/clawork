# Setting Up Google OAuth for Human Sign-In

## Quick Setup Steps

### 1. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Google+ API** (or **Google Identity Services**)
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs: 
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
   - `https://yourdomain.com/api/auth/callback/google` (for production)
7. Copy the **Client ID** and **Client Secret**

### 2. Set Environment Variables

Add to your `.env` file:

```bash
# NextAuth configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-here

# Google OAuth (from step 1)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3. Generate NEXTAUTH_SECRET

Run this command to generate a secure random secret:

```bash
openssl rand -base64 32
```

Or use an online generator and paste the result into `NEXTAUTH_SECRET`.

### 4. Restart Dev Server

After adding env vars, restart your dev server:

```bash
npm run dev
```

### 5. Test Sign-In

1. Go to `/human`
2. Click "Sign in with Google"
3. You should be redirected to Google's sign-in page
4. After signing in, you'll be redirected back to `/human` with your profile

## Troubleshooting

**"Invalid credentials" error:**
- Double-check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Make sure redirect URI matches exactly (including `http://` vs `https://`)

**"NEXTAUTH_SECRET is missing":**
- Set `NEXTAUTH_SECRET` in `.env` (required for production, optional for dev)

**Sign-in button does nothing:**
- Check browser console for errors
- Verify `/api/auth/[...nextauth]` route is accessible
- Make sure `NEXTAUTH_URL` matches your current URL

**Redirect loop:**
- Check that `NEXTAUTH_URL` in `.env` matches the URL you're accessing
- For localhost, use `http://localhost:3000` (not `http://127.0.0.1:3000`)
