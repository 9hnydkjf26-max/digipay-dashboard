# Configuration Setup

This directory uses a separate configuration file to store Supabase credentials securely.

## Quick Setup

### 1. Create your config file

```bash
cp config.example.js config.js
```

### 2. Update config.js with your credentials

Open `config.js` and replace the placeholder values:

```javascript
const SUPABASE_CONFIG = {
    url: 'https://hzdybwclwqkcobpwxzoo.supabase.co',  // Already set
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // Replace this
};
```

### 3. Get your Supabase anon key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **API**
4. Copy the **anon public** key
5. Paste it into `config.js`

## File Structure

```
your-project/
├── config.example.js    # Template (safe to commit to git)
├── config.js           # Your actual config (never commit!)
├── .gitignore          # Prevents config.js from being committed
├── admin-secrets.html  # Uses config.js
└── CONFIG-README.md    # This file
```

## Security Notes

✅ **config.example.js** - Safe to commit (contains no real keys)  
❌ **config.js** - Never commit (contains your actual API key)  
✅ **SUPABASE_ANON_KEY** - Safe to use in frontend (protected by RLS)  
❌ **SUPABASE_SERVICE_ROLE_KEY** - Never use in frontend (server-side only)

## Why use config.js?

1. **Separation of concerns** - Keep credentials out of HTML files
2. **Reusability** - Use the same config across multiple pages
3. **Security** - Easy to exclude from version control with .gitignore
4. **Team collaboration** - Each developer can have their own config.js

## Troubleshooting

### "Configuration Required" error
- Make sure you created `config.js` from `config.example.js`
- Verify you replaced `YOUR_SUPABASE_ANON_KEY_HERE` with your actual key
- Check that `config.js` is in the same directory as your HTML files

### Page still blank
- Open browser console (F12) to check for errors
- Verify `config.js` is loading (check Network tab)
- Make sure your Supabase project URL is correct

### Authentication fails
- Confirm you're using the **anon** key, not the service role key
- Verify your user has been granted the 'admin' role
- Check that RLS policies are configured correctly in Supabase

## Using config.js in other pages

To use the same config in other HTML files, add this to the `<head>`:

```html
<script src="config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<script>
    const supabase = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
    );
</script>
```

## Deployment

When deploying to production:

1. **GitHub Pages / Static hosting**: Upload `config.js` with your credentials
2. **Environment variables**: Consider using build-time environment variables instead
3. **Private repos**: If using a private repo, `config.js` can be committed safely
4. **Public repos**: Never commit `config.js` - each developer creates their own

## Example: Adding to other pages

Update all your existing pages to use `config.js`:

```diff
  <head>
+   <script src="config.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  </head>
  
  <script>
-   const SUPABASE_URL = 'https://....supabase.co';
-   const SUPABASE_ANON_KEY = 'eyJhbGc...';
+   const SUPABASE_URL = window.SUPABASE_CONFIG.url;
+   const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG.anonKey;
    
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  </script>
```

---

**Need help?** Check the [main setup guide](SECRETS-SETUP-GUIDE.md) or [troubleshooting section](#troubleshooting) above.
