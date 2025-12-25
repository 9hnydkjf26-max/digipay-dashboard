# GitHub Pages Deployment Guide

This guide will walk you through deploying your Stripe dashboard to GitHub Pages.

## Step 1: Prepare Your Repository

### Option A: Create a New Repository on GitHub

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Choose a repository name (e.g., `stripe-dashboard`)
5. Set visibility (Public for free GitHub Pages, or Private with GitHub Pro)
6. **Do NOT** initialize with README (we already have one)
7. Click "Create repository"

### Option B: Use GitHub CLI (if installed)

```bash
gh repo create stripe-dashboard --public --source=. --remote=origin
```

## Step 2: Initialize Git and Push Your Files

Open your terminal in the project directory and run:

```bash
# Initialize git repository
git init

# Add all files
git add .

# Make your first commit
git commit -m "Initial commit: Stripe transaction dashboard"

# Add your GitHub repository as remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/stripe-dashboard.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click on "Settings" (top menu)
3. Scroll down and click "Pages" in the left sidebar
4. Under "Source":
   - Select "Deploy from a branch"
   - Choose branch: `main`
   - Choose folder: `/ (root)`
5. Click "Save"

## Step 4: Wait for Deployment

- GitHub Pages will build your site (usually takes 1-5 minutes)
- You'll see a notification when it's ready
- Your site will be available at: `https://YOUR_USERNAME.github.io/stripe-dashboard/`

## Step 5: Configure Custom Domain (Optional)

If you have a custom domain:

1. In GitHub Pages settings, add your custom domain
2. In your domain registrar's DNS settings, add:
   - For apex domain (example.com):
     ```
     A record: 185.199.108.153
     A record: 185.199.109.153
     A record: 185.199.110.153
     A record: 185.199.111.153
     ```
   - For subdomain (dashboard.example.com):
     ```
     CNAME record: YOUR_USERNAME.github.io
     ```
3. Enable "Enforce HTTPS" in GitHub Pages settings

## Step 6: Update Supabase CORS Settings

After deployment, add your GitHub Pages URL to Supabase allowed origins:

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Add your GitHub Pages URL to "CORS Allowed Origins":
   ```
   https://YOUR_USERNAME.github.io
   ```

## Updating Your Site

Whenever you make changes:

```bash
# Make your changes to HTML files
git add .
git commit -m "Description of your changes"
git push origin main
```

GitHub Pages will automatically rebuild and deploy your site.

## Troubleshooting

### Site Not Loading
- Wait 5 minutes after first deployment
- Clear your browser cache
- Check GitHub Actions tab for build errors

### 404 Errors
- Ensure `index.html` exists in the root
- Check file names are lowercase
- Verify paths in your HTML files

### Supabase Connection Issues
- Verify CORS settings include your GitHub Pages URL
- Check that Supabase anon key is correctly configured
- Ensure RLS policies are properly set up

### HTTPS Issues
- Wait for SSL certificate to provision (can take up to 24 hours)
- Enable "Enforce HTTPS" in GitHub Pages settings

## Security Checklist

Before deploying, ensure:

- [ ] No API secrets are hardcoded in HTML files
- [ ] Supabase RLS policies are enabled and tested
- [ ] Only Supabase anon key is used in frontend code
- [ ] CORS is properly configured in Supabase
- [ ] Authentication is required for sensitive operations

## Local Testing Before Deployment

Test your files locally:

```bash
# If you have Python installed
python3 -m http.server 8000

# Or if you have Node.js installed
npx http-server -p 8000
```

Then visit `http://localhost:8000` in your browser.

## Additional Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Stripe API Documentation](https://stripe.com/docs/api)

## Need Help?

- GitHub Pages: https://docs.github.com/en/pages
- Supabase: https://supabase.com/docs
- Community: Open an issue in your repository
