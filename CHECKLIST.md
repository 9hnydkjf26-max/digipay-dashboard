# Pre-Deployment Checklist

Before deploying your Stripe dashboard to GitHub Pages, make sure you've completed these steps:

## Security & Configuration

- [ ] **Remove any hardcoded API keys** from HTML files
  - Check all `.html` files for Stripe secret keys
  - Check for any passwords or sensitive tokens
  - Only Supabase anon key should be in frontend code

- [ ] **Verify Supabase Configuration**
  - [ ] RLS policies are enabled on all tables
  - [ ] Test that users can only access their own data
  - [ ] Service role key is NOT in any HTML files
  - [ ] Anon key is correctly configured in all pages

- [ ] **Check Database Schema**
  - [ ] Schema file `20251224142348_remote_schema.sql` is imported to Supabase
  - [ ] All required tables exist
  - [ ] Indexes are created for performance

## File Review

- [ ] **Test All Pages Locally**
  - [ ] login.html - Authentication works
  - [ ] reports.html - Charts display correctly
  - [ ] warmup-compliance.html - Compliance tracking loads
  - [ ] stripe-refund-interface-secure.html - Refund interface functions
  - [ ] balance-checker.html - Balances display
  - [ ] All links between pages work

- [ ] **Check for Broken Links**
  - [ ] Internal page navigation works
  - [ ] All CSS/JS references are correct
  - [ ] No references to localhost or local file paths

## GitHub Setup

- [ ] **GitHub Account Ready**
  - [ ] You have a GitHub account
  - [ ] You can create new repositories
  - [ ] For private repos: You have GitHub Pro/Team

- [ ] **Choose Repository Name**
  - Suggested: `stripe-dashboard` or `transaction-dashboard`
  - Name will be part of your URL: `username.github.io/repo-name`

## Post-Deployment Tasks

After deploying, you'll need to:

- [ ] **Update Supabase CORS Settings**
  - Add your GitHub Pages URL: `https://YOUR_USERNAME.github.io`
  - This allows API calls from your deployed site

- [ ] **Test Production Site**
  - [ ] All pages load correctly
  - [ ] Authentication works
  - [ ] Data displays properly
  - [ ] Charts and interactive elements function

- [ ] **Configure Custom Domain** (Optional)
  - [ ] DNS records configured
  - [ ] HTTPS enabled in GitHub Pages
  - [ ] Custom domain added to Supabase CORS

## Environment-Specific Settings

If your HTML files have different settings for development vs production:

- [ ] Update Supabase URLs if different
- [ ] Update any redirect URLs
- [ ] Update any webhook URLs in Stripe dashboard
- [ ] Test in production before announcing

## Documentation

- [ ] README.md is complete and accurate
- [ ] DEPLOYMENT.md guide is available
- [ ] Team members know how to access the dashboard
- [ ] Support documentation is available

## Quick Test Commands

Before deploying, test locally:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx http-server -p 8000

# Then open http://localhost:8000 in your browser
```

## Common Issues to Avoid

- ❌ Don't commit API secret keys
- ❌ Don't use localhost URLs in production
- ❌ Don't skip RLS policy testing
- ❌ Don't forget to update CORS settings
- ❌ Don't make repository public if it contains sensitive data

## Ready to Deploy?

Once all items are checked:

1. Run `./deploy.sh` (Linux/Mac) or follow DEPLOYMENT.md manually
2. Create GitHub repository
3. Push code
4. Enable GitHub Pages
5. Update Supabase CORS
6. Test production site

---

**Last Updated:** Check this list before every major deployment
