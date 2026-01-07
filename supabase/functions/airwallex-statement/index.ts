// Edge Function: airwallex-statement
// Generates clean CSV statement from Airwallex transactions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Transaction types to exclude (card payment details)
const EXCLUDED_TYPES = [
  'payment_attempt',
  'authorization'
];
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get Supabase client
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Verify user authentication
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    console.log(`User ${user.email} requesting statement`);
    // Parse request body
    const { account_id, days = 30 } = await req.json();
    if (!account_id) {
      throw new Error('account_id is required');
    }
    // Get account from database
    const { data: account, error: accountError } = await supabaseClient.from('payment_accounts').select('account_id, account_name, secret_key_name').eq('account_id', account_id).eq('payment_provider', 'airwallex').eq('is_active', true).single();
    if (accountError || !account) {
      throw new Error(`Airwallex account ${account_id} not found`);
    }
    if (!account.secret_key_name) {
      throw new Error('Account has no API credentials configured');
    }
    const clientIdSecretName = account.secret_key_name;
    const apiKeySecretName = account.secret_key_name.replace('_KEY', '_SECRET');
    const clientId = Deno.env.get(clientIdSecretName);
    const apiKey = Deno.env.get(apiKeySecretName);
    if (!clientId || !apiKey) {
      throw new Error('API credentials not found');
    }
    // Authenticate with Airwallex
    const authResponse = await fetch('https://api.airwallex.com/api/v1/authentication/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key': apiKey
      }
    });
    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(`Airwallex authentication failed: ${errorText}`);
    }
    const authData = await authResponse.json();
    const token = authData.token;
    // Fetch current balance
    console.log('Fetching current balance...');
    const balanceResponse = await fetch('https://api.airwallex.com/api/v1/balances/current', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    let currentBalance = 0;
    let currency = 'CAD';
    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json();
      // Find CAD balance or use first available
      const cadBalance = balanceData.items?.find((b)=>b.currency === 'CAD');
      if (cadBalance) {
        currentBalance = parseFloat(cadBalance.available_amount || cadBalance.total_amount || 0);
        currency = 'CAD';
      } else if (balanceData.items?.length > 0) {
        currentBalance = parseFloat(balanceData.items[0].available_amount || balanceData.items[0].total_amount || 0);
        currency = balanceData.items[0].currency || 'CAD';
      }
      console.log(`Current balance: ${currentBalance} ${currency}`);
    }
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const fromDate = startDate.toISOString().split('T')[0];
    const toDate = endDate.toISOString().split('T')[0];
    console.log(`Fetching transactions from ${fromDate} to ${toDate}`);
    // Fetch all transactions for the period
    let allTransactions = [];
    let pageNum = 0;
    let hasMore = true;
    while(hasMore && pageNum < 10){
      const txResponse = await fetch(`https://api.airwallex.com/api/v1/financial_transactions?page_num=${pageNum}&page_size=200`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!txResponse.ok) {
        throw new Error('Failed to fetch transactions');
      }
      const txData = await txResponse.json();
      const items = txData.items || [];
      // Filter by date range
      const filtered = items.filter((tx)=>{
        const txDate = new Date(tx.created_at);
        return txDate >= startDate && txDate <= endDate;
      });
      allTransactions = allTransactions.concat(filtered);
      hasMore = txData.has_more && items.length > 0;
      pageNum++;
      // Stop if we're getting transactions older than our start date
      if (items.length > 0) {
        const oldestTx = new Date(items[items.length - 1].created_at);
        if (oldestTx < startDate) {
          hasMore = false;
        }
      }
    }
    // Filter out excluded types and zero amounts
    const transactions = allTransactions.filter((tx)=>{
      const txType = (tx.transaction_type || '').toLowerCase();
      const amount = parseFloat(tx.amount) || 0;
      if (EXCLUDED_TYPES.some((excluded)=>txType.includes(excluded))) {
        return false;
      }
      if (amount === 0) {
        return false;
      }
      return true;
    });
    // Sort by date descending (newest first)
    transactions.sort((a, b)=>{
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    console.log(`Found ${transactions.length} transactions for statement`);
    // Calculate running balances (work backwards from current balance)
    let runningBalance = currentBalance;
    const transactionsWithBalance = transactions.map((tx)=>{
      const balanceAfter = runningBalance;
      const amount = parseFloat(tx.amount) || 0;
      const isCredit = isTransactionCredit(tx);
      // Reverse the transaction to get balance before
      if (isCredit) {
        runningBalance = runningBalance - Math.abs(amount);
      } else {
        runningBalance = runningBalance + Math.abs(amount);
      }
      return {
        ...tx,
        calculated_balance: balanceAfter
      };
    });
    // Opening balance is the running balance after reversing all transactions
    const openingBalance = runningBalance;
    // Generate clean CSV
    const csv = generateCleanCSV(transactionsWithBalance, account.account_name || account_id, fromDate, toDate, openingBalance, currentBalance, currency);
    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="Airwallex_Statement_${fromDate}_to_${toDate}.csv"`
      },
      status: 200
    });
  } catch (error) {
    console.error('Statement error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
function generateCleanCSV(transactions, accountName, fromDate, toDate, openingBalance, closingBalance, currency) {
  const lines = [];
  // Header info
  lines.push(`ACCOUNT STATEMENT`);
  lines.push(`Account: ${accountName}`);
  lines.push(`Period: ${formatDateNice(fromDate)} to ${formatDateNice(toDate)}`);
  lines.push(`Generated: ${formatDateNice(new Date().toISOString().split('T')[0])} at ${new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })}`);
  lines.push(``);
  lines.push(`Opening Balance: ${currency} ${openingBalance.toFixed(2)}`);
  lines.push(`Closing Balance: ${currency} ${closingBalance.toFixed(2)}`);
  lines.push(`Total Transactions: ${transactions.length}`);
  lines.push('');
  // Column headers
  lines.push('Date,Type,From/To,Description,Debit,Credit,Balance,Currency,Reference');
  // Transaction rows
  transactions.forEach((tx)=>{
    const date = tx.created_at ? formatDateNice(tx.created_at.split('T')[0]) : '';
    const type = formatTransactionType(tx.transaction_type || tx.type || '');
    const counterparty = extractCounterparty(tx);
    const description = cleanText(tx.description || tx.reason || tx.reference || '');
    const amount = parseFloat(tx.amount) || 0;
    const txCurrency = tx.currency || currency;
    const reference = cleanText(tx.source_id || tx.id || '');
    const balance = tx.calculated_balance;
    // Determine if debit or credit
    const isCredit = isTransactionCredit(tx);
    const debit = isCredit ? '' : Math.abs(amount).toFixed(2);
    const credit = isCredit ? Math.abs(amount).toFixed(2) : '';
    lines.push(`${date},"${type}","${counterparty}","${description}",${debit},${credit},${balance.toFixed(2)},${txCurrency},"${reference}"`);
  });
  // Summary
  lines.push('');
  const totalCredits = transactions.filter((tx)=>isTransactionCredit(tx)).reduce((sum, tx)=>sum + Math.abs(parseFloat(tx.amount) || 0), 0);
  const totalDebits = transactions.filter((tx)=>!isTransactionCredit(tx)).reduce((sum, tx)=>sum + Math.abs(parseFloat(tx.amount) || 0), 0);
  lines.push(`SUMMARY`);
  lines.push(`Opening Balance:,,,,,,${openingBalance.toFixed(2)},${currency}`);
  lines.push(`Total Credits:,,,,,${totalCredits.toFixed(2)},,`);
  lines.push(`Total Debits:,,,,${totalDebits.toFixed(2)},,,`);
  lines.push(`Closing Balance:,,,,,,${closingBalance.toFixed(2)},${currency}`);
  return lines.join('\n');
}
function formatDateNice(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
function formatTransactionType(type) {
  const typeMap = {
    'deposit': 'Deposit',
    'withdrawal': 'Withdrawal',
    'transfer': 'Transfer',
    'transfer_in': 'Transfer In',
    'transfer_out': 'Transfer Out',
    'payout': 'Payout',
    'payment': 'Payment Received',
    'payment_capture': 'Payment Received',
    'payment_refund': 'Refund Issued',
    'conversion_deposit': 'FX Conversion In',
    'conversion_withdrawal': 'FX Conversion Out',
    'conversion': 'FX Conversion',
    'fee': 'Fee',
    'interest': 'Interest',
    'adjustment': 'Adjustment',
    'settlement': 'Settlement'
  };
  const lowerType = (type || '').toLowerCase();
  return typeMap[lowerType] || type.replace(/_/g, ' ').replace(/\b\w/g, (l)=>l.toUpperCase());
}
function extractCounterparty(tx) {
  // Try multiple sources for counterparty information
  // Beneficiary (for outgoing transfers/payouts)
  if (tx.beneficiary) {
    const b = tx.beneficiary;
    if (b.company_name) return b.company_name;
    if (b.name) return b.name;
    if (b.first_name || b.last_name) {
      return `${b.first_name || ''} ${b.last_name || ''}`.trim();
    }
    if (b.email) return b.email;
    if (b.bank_details?.account_name) return b.bank_details.account_name;
  }
  // Beneficiary name directly
  if (tx.beneficiary_name) return tx.beneficiary_name;
  // Counterparty object
  if (tx.counterparty) {
    const c = tx.counterparty;
    if (c.name) return c.name;
    if (c.company_name) return c.company_name;
    if (c.bank_name) return c.bank_name;
    if (c.account_name) return c.account_name;
  }
  // Payer info (for incoming payments)
  if (tx.payer_name) return tx.payer_name;
  if (tx.payer) {
    const p = tx.payer;
    if (p.name) return p.name;
    if (p.company_name) return p.company_name;
    if (p.email) return p.email;
  }
  // Source info
  if (tx.source_name) return tx.source_name;
  if (tx.source) {
    if (typeof tx.source === 'string') return tx.source;
    if (tx.source.name) return tx.source.name;
  }
  // Sender info
  if (tx.sender_name) return tx.sender_name;
  if (tx.sender) {
    const s = tx.sender;
    if (s.name) return s.name;
    if (s.company_name) return s.company_name;
  }
  // Recipient info
  if (tx.recipient_name) return tx.recipient_name;
  if (tx.recipient) {
    const r = tx.recipient;
    if (r.name) return r.name;
    if (r.email) return r.email;
  }
  // Customer info
  if (tx.customer) {
    const c = tx.customer;
    if (c.name) return c.name;
    if (c.email) return c.email;
  }
  // Merchant info
  if (tx.merchant_name) return tx.merchant_name;
  // Additional info
  if (tx.additional_info) {
    const a = tx.additional_info;
    if (a.payer_name) return a.payer_name;
    if (a.beneficiary_name) return a.beneficiary_name;
  }
  // Fall back to reference or description for context
  if (tx.reference && !tx.reference.startsWith('ft_')) {
    return tx.reference;
  }
  return '';
}
function isTransactionCredit(tx) {
  const txType = (tx.transaction_type || tx.type || '').toLowerCase();
  // Credit types
  if (txType.includes('deposit') || txType.includes('receive') || txType.includes('credit') || txType.includes('incoming') || txType.includes('settlement') || txType.includes('payment') || txType.includes('capture')) {
    return true;
  }
  // Debit types
  if (txType.includes('withdraw') || txType.includes('payout') || txType.includes('transfer') || txType.includes('fee') || txType.includes('debit') || txType.includes('refund')) {
    return false;
  }
  // Check amount sign as fallback
  const amount = parseFloat(tx.amount) || 0;
  return amount > 0;
}
function cleanText(text) {
  if (!text) return '';
  return text.replace(/"/g, "'").replace(/,/g, ';').replace(/\n/g, ' ').replace(/\r/g, '').trim();
}
