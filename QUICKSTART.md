# Quick Start - Deploy in 5 Minutes

## What You Have

All your HTML files and configuration are ready to deploy to GitHub Pages!

## Files Included

**HTML Pages:**
- `index.html` - Landing page (redirects to login)
- `login.html` - Authentication page
- `reports.html` - Transaction reports & charts
- `warmup-compliance.html` - Compliance tracking
- `stripe-refund-interface-secure.html` - Refund management
- `balance-checker.html` - Balance monitoring
- `balances-debug.html` - Debug interface
- `page-template.html` - Template for new pages

**Database:**
- `20251224142348_remote_schema.sql` - Complete database schema

**Documentation:**
- `README.md` - Project overview
- `DEPLOYMENT.md` - Detailed deployment guide
- `CHECKLIST.md` - Pre-deployment checklist
- `.gitignore` - Git ignore rules

**Tools:**
- `deploy.sh` - Automated deployment script (Mac/Linux)

## Deploy Now (Mac/Linux)

```bash
# 1. Navigate to your project folder
cd /path/to/your/project

# 2. Run the deployment script
chmod +x deploy.sh
./deploy.sh

# 3. Follow the prompts
```

## Deploy Now (Windows or Manual)

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `stripe-dashboard` (or your choice)
3. Set to **Public** (required for free GitHub Pages)
4. **Don't** check "Initialize with README"
5. Click "Create repository"

### Step 2: Upload Files

**Option A - GitHub Web Interface:**
1. On your new repository page, click "uploading an existing file"
2. Drag and drop ALL files from your folder
3. Commit message: "Initial commit"
4. Click "Commit changes"

**Option B - Git Command Line:**
```bash
git init
git add .
git commit -m "Initial commit: Stripe transaction dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/stripe-dashboard.git
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click "Settings" → "Pages" (left sidebar)
3. Under "Source":
   - Branch: `main`
   - Folder: `/ (root)`
4. Click "Save"
5. Wait 2-5 minutes for deployment

### Step 4: Update Supabase

1. Go to your Supabase project: https://supabase.com/dashboard/project/hzdybwclwqkcobpwxzoo
2. Settings → API → CORS Allowed Origins
3. Add: `https://YOUR_USERNAME.github.io`
4. Click "Save"

### Step 5: Test Your Site

Visit: `https://YOUR_USERNAME.github.io/stripe-dashboard/`

## Important Security Notes

Before deploying, verify:

- ✅ No Stripe **secret** keys in HTML files (only publishable keys are OK)
- ✅ No Supabase **service role** keys (only anon key is OK)
- ✅ RLS policies are enabled in Supabase
- ✅ No passwords or sensitive credentials

## Troubleshooting

**Site shows 404:**
- Wait 5 minutes after enabling Pages
- Clear browser cache
- Check GitHub Pages settings

**Can't connect to Supabase:**
- Verify CORS settings include your GitHub Pages URL
- Check browser console for errors
- Verify Supabase anon key is correct

**Authentication doesn't work:**
- Check Supabase Auth settings
- Verify redirect URLs include your GitHub Pages domain
- Ensure RLS policies are properly configured

## Your Site URL

After deployment, your dashboard will be at:

```
https://YOUR_USERNAME.github.io/stripe-dashboard/
```

Replace `YOUR_USERNAME` with your actual GitHub username.

## Next Steps

1. Test all pages and functionality
2. Set up custom domain (optional)
3. Configure Stripe webhooks to point to your Supabase functions
4. Share access with your team
5. Set up monitoring and alerts

## Need Help?

- Check `DEPLOYMENT.md` for detailed instructions
- Review `CHECKLIST.md` before deploying
- GitHub Pages docs: https://docs.github.com/pages
- Supabase docs: https://supabase.com/docs

## Custom Domain (Optional)

Want to use your own domain like `dashboard.yourcompany.com`?

1. In GitHub Pages settings, add your custom domain
2. In your DNS settings, add:
   - CNAME record pointing to `YOUR_USERNAME.github.io`
3. Wait for DNS propagation (up to 24 hours)
4. Enable "Enforce HTTPS" in GitHub Pages

---

**Ready to deploy? Follow the steps above and your dashboard will be live in minutes!**
