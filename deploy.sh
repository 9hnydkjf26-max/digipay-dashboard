#!/bin/bash

# Stripe Dashboard - GitHub Deployment Script
# This script will help you push your dashboard to GitHub

echo "======================================"
echo "Stripe Dashboard - GitHub Setup"
echo "======================================"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "Error: Git is not installed. Please install Git first."
    echo "Visit: https://git-scm.com/downloads"
    exit 1
fi

# Get GitHub username
read -p "Enter your GitHub username: " github_username

if [ -z "$github_username" ]; then
    echo "Error: GitHub username cannot be empty"
    exit 1
fi

# Get repository name
read -p "Enter repository name (default: stripe-dashboard): " repo_name
repo_name=${repo_name:-stripe-dashboard}

echo ""
echo "Setting up repository..."
echo ""

# Initialize git if not already initialized
if [ ! -d ".git" ]; then
    git init
    echo "✓ Git repository initialized"
else
    echo "✓ Git repository already exists"
fi

# Add all files
git add .
echo "✓ Files added to git"

# Create initial commit
git commit -m "Initial commit: Stripe transaction dashboard" 2>/dev/null || echo "✓ Files already committed"

# Set main branch
git branch -M main 2>/dev/null
echo "✓ Main branch set"

# Add remote
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/$github_username/$repo_name.git"
echo "✓ Remote repository configured"

echo ""
echo "======================================"
echo "Next Steps:"
echo "======================================"
echo ""
echo "1. Create a repository on GitHub:"
echo "   - Go to https://github.com/new"
echo "   - Repository name: $repo_name"
echo "   - Make it Public (for free GitHub Pages)"
echo "   - Do NOT initialize with README"
echo "   - Click 'Create repository'"
echo ""
echo "2. Push your code to GitHub:"
echo "   Run this command:"
echo "   git push -u origin main"
echo ""
echo "3. Enable GitHub Pages:"
echo "   - Go to: https://github.com/$github_username/$repo_name/settings/pages"
echo "   - Source: Deploy from a branch"
echo "   - Branch: main, folder: / (root)"
echo "   - Click Save"
echo ""
echo "4. Your site will be available at:"
echo "   https://$github_username.github.io/$repo_name/"
echo ""
echo "5. Update Supabase CORS settings:"
echo "   Add this URL to allowed origins in Supabase:"
echo "   https://$github_username.github.io"
echo ""
echo "======================================"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
echo ""
