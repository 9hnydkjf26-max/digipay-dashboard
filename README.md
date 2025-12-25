# Stripe Transaction Dashboard

A comprehensive Stripe transaction reporting dashboard with transaction volume tracking, warmup compliance monitoring, and refund management.

## Features

- **Transaction Volume Charts**: Interactive charts with clickable bars for detailed transaction analysis
- **Warmup Compliance Tracking**: Monitor and maintain compliance with transaction warmup requirements
- **Refund Management**: Secure interface for processing and tracking refunds
- **Balance Checker**: Real-time balance monitoring for Stripe and Airwallex accounts
- **Multi-User Access**: Row-level security (RLS) policies for secure data access

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Supabase (PostgreSQL with RLS)
- Payment Processing: Stripe API, Airwallex API
- Hosting: GitHub Pages

## Setup Instructions

### Prerequisites

1. A Supabase account and project
2. Stripe API credentials
3. Airwallex API credentials (if using balance checker)

### Supabase Configuration

Your Supabase project URL: `https://hzdybwclwqkcobpwxzoo.supabase.co`

1. Import the database schema from `20251224142348_remote_schema.sql`
2. Set up the following environment variables in your Supabase project:
   - Stripe API keys
   - Airwallex API keys (if applicable)

### Local Development

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/stripe-dashboard.git
   cd stripe-dashboard
   ```

2. Open `login.html` in your browser to start using the dashboard

3. Update the Supabase URL and anon key in each HTML file if needed

### Deployment to GitHub Pages

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. Enable GitHub Pages:
   - Go to your repository Settings
   - Navigate to "Pages" in the left sidebar
   - Under "Source", select "Deploy from a branch"
   - Select the `main` branch and `/ (root)` folder
   - Click "Save"

3. Your site will be available at: `https://YOUR_USERNAME.github.io/stripe-dashboard/`

## File Structure

```
.
├── login.html                          # Main login page
├── reports.html                        # Transaction reports and volume charts
├── warmup-compliance.html              # Warmup compliance tracking
├── stripe-refund-interface-secure.html # Refund management interface
├── balance-checker.html                # Balance monitoring dashboard
├── balances-debug.html                 # Debug interface for balances
├── page-template.html                  # Template for new pages
├── 20251224142348_remote_schema.sql    # Database schema
└── README.md                           # This file
```

## Security Notes

- All HTML files use Supabase RLS policies for data access control
- Sensitive operations require authentication
- API keys should be stored as environment variables in Supabase
- Never commit actual API keys to the repository

## Usage

1. **Login**: Start at `login.html` to authenticate
2. **Reports**: View transaction volumes and click on chart bars for details
3. **Warmup Compliance**: Monitor and track compliance metrics
4. **Refunds**: Process refunds through the secure interface
5. **Balance Checker**: Monitor account balances across payment processors

## TypeScript Files

The following TypeScript files contain backend logic (Edge Functions):
- `airwallex-sync.ts`
- `export-system-state.ts`
- `refund-gateway.ts`
- `stripe-immediate-sync.ts`
- `stripe-initial-migration.ts`
- `stripe-refund-lookup.ts`
- `stripe-scheduled-sync.ts`
- `stripe-webhook.ts`
- `warmup-compliance-report.ts`
- `airwallex-balance-checker.ts`

These should be deployed as Supabase Edge Functions.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Support

For issues or questions, please open an issue on GitHub.

## License

[Add your license here]
