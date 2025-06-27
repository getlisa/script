// To run this script, ensure you have @supabase/supabase-js and @types/node installed:
// npm install @supabase/supabase-js
// npm install --save-dev @types/node

import { createClient } from '@supabase/supabase-js';

// === Supabase Configuration ===
const SUPABASE_URL = 'https://tpvserzjhmyxjssabokm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdnNlcnpqaG15eGpzc2Fib2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjgwMjcsImV4cCI6MjA2NTI0NDAyN30.4cYrSzhNDG-Sd48_UO0rw2fnKtI5PasZaeoh8E4OLQg';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('=== Supabase Data Analysis ===');

  // 1. Total call logs
  const { data: calls, error: callErr } = await supabase
    .from('call_logs')
    .select('*');
  if (callErr) {
    console.error('Error fetching call_logs:', callErr.message);
    return;
  }
  console.log(`Total call logs: ${calls.length}`);

  // 2. Total leads
  const { data: leads, error: leadErr } = await supabase
    .from('leads')
    .select('*');
  if (leadErr) {
    console.error('Error fetching leads:', leadErr.message);
    return;
  }
  console.log(`Total leads: ${leads.length}`);

  // 3. Lead conversion rate
  const conversionRate = calls.length > 0 ? (leads.length / calls.length) * 100 : 0;
  console.log(`Lead Conversion Rate: ${conversionRate.toFixed(2)}%`);

  // 4. Recent call logs
  const recentCalls = calls
    .sort((a, b) => (b.start_timestamp || '').localeCompare(a.start_timestamp || ''))
    .slice(0, 5);
  console.log('\n5 Most Recent Calls:');
  for (const call of recentCalls) {
    console.log(`- Call ID: ${call.call_id}, Agent: ${call.agent_id}, Date: ${call.start_timestamp}, Intent: ${call.intent}`);
  }

  // 5. Intent breakdown
  const intentCounts: Record<string, number> = {};
  for (const call of calls) {
    const intent = call.intent || 'Unknown';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }
  console.log('\nIntent Breakdown:');
  for (const [intent, count] of Object.entries(intentCounts)) {
    console.log(`- ${intent}: ${count}`);
  }

  // 6. Recent leads
  const recentLeads = leads
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 5);
  console.log('\n5 Most Recent Leads:');
  for (const lead of recentLeads) {
    console.log(`- Lead for Call ID: ${lead.call_id}, Agent: ${lead.agent_id}, Type: ${lead.lead_type}, Status: ${lead.status}, Date: ${lead.created_at}`);
  }

  // 7. Leads by type
  const leadTypeCounts: Record<string, number> = {};
  for (const lead of leads) {
    const type = lead.lead_type || 'Unknown';
    leadTypeCounts[type] = (leadTypeCounts[type] || 0) + 1;
  }
  console.log('\nLeads by Type:');
  for (const [type, count] of Object.entries(leadTypeCounts)) {
    console.log(`- ${type}: ${count}`);
  }

  console.log('\n=== Analysis Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
}); 