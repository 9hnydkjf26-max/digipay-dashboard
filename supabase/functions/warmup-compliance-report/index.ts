import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { account_id, warmup_start_date } = await req.json();
    if (!account_id || !warmup_start_date) {
      throw new Error('account_id and warmup_start_date are required');
    }
    const startDate = new Date(warmup_start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Get warmup schedule
    const { data: schedules, error: schedError } = await supabaseClient.from('stripe_warmup_schedule').select('*').order('week_number', {
      ascending: true
    });
    if (schedError || !schedules) {
      throw new Error('Failed to fetch warmup schedule');
    }
    // Get account name
    const { data: account } = await supabaseClient.from('payment_accounts').select('account_name').eq('account_id', account_id).single();
    // Generate daily reports from start date to today
    const dailyReports = [];
    for(let currentDate = new Date(startDate); currentDate <= today; currentDate.setDate(currentDate.getDate() + 1)){
      const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.min(9, Math.floor(daysSinceStart / 7) + 1);
      const schedule = schedules.find((s)=>s.week_number === weekNumber);
      if (!schedule) continue;
      // Get transactions for this day
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      const startTs = Math.floor(dayStart.getTime() / 1000);
      const endTs = Math.floor(dayEnd.getTime() / 1000);
      const { data: transactions } = await supabaseClient.from('stripe_charges').select('amount').eq('stripe_account_id', account_id).eq('payment_provider', 'stripe').gte('created', startTs).lte('created', endTs);
      const totalVolume = transactions?.reduce((sum, tx)=>sum + tx.amount, 0) || 0;
      const maxTransaction = transactions?.reduce((max, tx)=>Math.max(max, tx.amount), 0) || 0;
      const transactionCount = transactions?.length || 0;
      // Check violations
      const violations = [];
      if (totalVolume > schedule.max_daily_volume_cents) {
        violations.push(`Volume: $${(totalVolume / 100).toFixed(2)} > $${(schedule.max_daily_volume_cents / 100).toFixed(2)}`);
      }
      if (maxTransaction > schedule.max_transaction_size_cents) {
        violations.push(`Transaction size: $${(maxTransaction / 100).toFixed(2)} > $${(schedule.max_transaction_size_cents / 100).toFixed(2)}`);
      }
      if (transactionCount > schedule.max_transactions_per_day) {
        violations.push(`Count: ${transactionCount} > ${schedule.max_transactions_per_day}`);
      }
      dailyReports.push({
        date: currentDate.toISOString().split('T')[0],
        week_number: weekNumber,
        limits: {
          max_daily_volume: schedule.max_daily_volume_cents,
          max_transaction_size: schedule.max_transaction_size_cents,
          max_transactions_per_day: schedule.max_transactions_per_day
        },
        actual: {
          daily_volume: totalVolume,
          max_transaction_size: maxTransaction,
          transaction_count: transactionCount
        },
        status: violations.length === 0 ? 'COMPLIANT' : 'VIOLATION',
        violations,
        utilization: {
          volume_percent: Math.round(totalVolume / schedule.max_daily_volume_cents * 100 * 10) / 10,
          transaction_size_percent: Math.round(maxTransaction / schedule.max_transaction_size_cents * 100 * 10) / 10,
          count_percent: Math.round(transactionCount / schedule.max_transactions_per_day * 100 * 10) / 10
        }
      });
    }
    // Calculate summary
    const violationDays = dailyReports.filter((r)=>r.status === 'VIOLATION');
    const summary = {
      account_id,
      account_name: account?.account_name || account_id,
      warmup_start_date,
      total_days: dailyReports.length,
      compliant_days: dailyReports.filter((r)=>r.status === 'COMPLIANT').length,
      violation_days: violationDays.length,
      compliance_rate: dailyReports.length > 0 ? Math.round(dailyReports.filter((r)=>r.status === 'COMPLIANT').length / dailyReports.length * 100 * 10) / 10 : 0,
      current_week: dailyReports.length > 0 ? dailyReports[dailyReports.length - 1].week_number : 1
    };
    return new Response(JSON.stringify({
      summary,
      daily_reports: dailyReports
    }, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
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
