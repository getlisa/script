// To run this script, ensure you have node-fetch and @types/node installed:
// npm install node-fetch
// npm install --save-dev @types/node
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
// === Supabase Configuration - UPDATED ===
const SUPABASE_URL = 'https://tpvserzjhmyxjssabokm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdnNlcnpqaG15eGpzc2Fib2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjgwMjcsImV4cCI6MjA2NTI0NDAyN30.4cYrSzhNDG-Sd48_UO0rw2fnKtI5PasZaeoh8E4OLQg';
const OPENAI_API_KEY = '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'; // <-- put your key here if not using env
const RETELL_API_KEY = 'key_f179b569899f2ab68c5f875033e0';
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RETELL_API_KEY) {
    // @ts-ignore
    console.error('Missing credentials. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and RETELL_API_KEY.');
    // @ts-ignore
    process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const LOG_FILE = 'process_log.txt';
// Allowed fields for call_logs and leads
const CALL_LOGS_FIELDS = [
    'call_id', 'agent_id', 'call_status', 'start_timestamp', 'end_timestamp', 'transcript',
    'recording_url', 'call_type', 'from_number', 'appointment_status', 'appointment_date',
    'appointment_time', 'client_name', 'client_address', 'client_email', 'notes',
    'user_sentiment', 'call_successful', 'in_voicemail', 'processed', 'created_at', 'updated_at',
    'intent', 'summary', 'quick_summary'
];
const LEADS_FIELDS = [
    'call_id', 'agent_id', 'lead_type', 'status', 'client_name', 'client_email', 'client_address',
    'job_description', 'job_type', 'appointment_date', 'appointment_status', 'from_number', 'created_at', 'updated_at'
];
function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}
function classifyIntent(text) {
    const content = text.toLowerCase();
    if (content.includes('emergency') || content.includes('urgent') || content.includes('asap')) {
        return 'Emergency';
    }
    else if (content.includes('service') || content.includes('repair') || content.includes('fix')) {
        return 'Service';
    }
    else if (content.includes('quote') || content.includes('estimate') || content.includes('price')) {
        return 'Quotation';
    }
    return 'Inquiry';
}
async function fetchAgentIds() {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('agent_id')
        .not('agent_id', 'is', null);
    if (error) {
        log('Error fetching agent IDs: ' + error.message);
        return [];
    }
    return (data || []).map((row) => row.agent_id).filter(Boolean);
}
async function fetchCallsFromApi(agentId) {
    const apiUrl = 'https://api.retellai.com/v2/list-calls';
    // Calculate timestamp for 2 days ago
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    log(`[fetchCallsFromApi] Filtering for calls with start_timestamp >= ${twoDaysAgo}`);
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RETELL_API_KEY}`
            },
            body: JSON.stringify({
                filter_criteria: {
                    agent_id: [agentId],
                    start_timestamp: { gte: twoDaysAgo }
                },
                limit: 1000
            })
        });
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
            log(`[fetchCallsFromApi] Fetched ${data.length} calls from API.`);
            if (data.length > 0) {
                const timestamps = data.map(call => call.start_timestamp).filter(Boolean).map(ts => new Date(ts).getTime());
                const minDate = new Date(Math.min(...timestamps));
                const maxDate = new Date(Math.max(...timestamps));
                log(`[fetchCallsFromApi] Earliest call: ${minDate.toISOString()}, Latest call: ${maxDate.toISOString()}`);
            }
            return data;
        }
        return [];
    }
    catch (error) {
        log(`Error fetching calls for agent ${agentId}: ${error}`);
        return [];
    }
}
async function callExists(call_id) {
    const { data, error } = await supabase
        .from('call_logs')
        .select('call_id')
        .eq('call_id', call_id)
        .maybeSingle();
    if (error) {
        log(`Error checking call existence for ${call_id}: ${error.message}`);
        return false;
    }
    return !!data;
}
async function leadExists(call_id) {
    const { data, error } = await supabase
        .from('leads')
        .select('call_id')
        .eq('call_id', call_id)
        .maybeSingle();
    if (error) {
        log(`Error checking lead existence for ${call_id}: ${error.message}`);
        return false;
    }
    return !!data;
}
function filterFields(obj, allowedFields) {
    const filtered = {};
    for (const key of allowedFields) {
        if (obj[key] !== undefined)
            filtered[key] = obj[key];
    }
    return filtered;
}
// Helper to convert numeric date/time fields to ISO strings
function normalizeDateFields(obj, dateFields) {
    const out = { ...obj };
    for (const field of dateFields) {
        if (out[field] !== undefined && out[field] !== null) {
            // Handle invalid date strings
            if (typeof out[field] === 'string') {
                const dateStr = out[field].trim();
                if (dateStr === '' || dateStr === 'null' || dateStr === 'undefined' ||
                    dateStr === 'unknown' || dateStr === 'Not specified' ||
                    dateStr.toLowerCase().includes('morning') ||
                    dateStr.toLowerCase().includes('afternoon') ||
                    dateStr.toLowerCase().includes('evening') ||
                    dateStr.toLowerCase().includes('next week') ||
                    dateStr.toLowerCase().includes('to be confirmed')) {
                    out[field] = null;
                    continue;
                }
                // If it looks like a number, convert
                if (/^\d{10,}$/.test(dateStr)) {
                    const num = Number(dateStr);
                    if (!isNaN(num)) {
                        if (field === 'appointment_date') {
                            out[field] = new Date(num).toISOString().slice(0, 10);
                        }
                        else if (field === 'appointment_time' || field === 'appointment_start' || field === 'appointment_end') {
                            out[field] = new Date(num).toISOString().slice(11, 19);
                        }
                        else {
                            out[field] = new Date(num).toISOString();
                        }
                    }
                }
                // Try to parse as date string
                else if (field === 'appointment_date') {
                    try {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                            out[field] = date.toISOString().slice(0, 10);
                        }
                        else {
                            out[field] = null;
                        }
                    }
                    catch (e) {
                        out[field] = null;
                    }
                }
                // Try to parse as time string
                else if (field === 'appointment_time' || field === 'appointment_start' || field === 'appointment_end') {
                    try {
                        // Check if it's already in HH:MM:SS format
                        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(dateStr)) {
                            out[field] = dateStr;
                        }
                        else {
                            out[field] = null;
                        }
                    }
                    catch (e) {
                        out[field] = null;
                    }
                }
            }
            // If it's a number, treat as ms timestamp
            else if (typeof out[field] === 'number') {
                // For appointment_date, only keep the date part
                if (field === 'appointment_date') {
                    out[field] = new Date(out[field]).toISOString().slice(0, 10);
                }
                else if (field === 'appointment_time' || field === 'appointment_start' || field === 'appointment_end') {
                    // For time, extract time part
                    out[field] = new Date(out[field]).toISOString().slice(11, 19);
                }
                else {
                    out[field] = new Date(out[field]).toISOString();
                }
            }
        }
    }
    return out;
}
// Helper: Extract appointment/contact info from transcript if missing
async function extractFromTranscript(call) {
    // Only try if transcript exists and any key field is missing
    if (!call.transcript)
        return call;
    const missing = !call.client_name || !call.client_email || !call.appointment_date || !call.appointment_time;
    if (!missing)
        return call;
    // Dummy extraction: in real use, call your AI or extraction service here
    // For now, just return call as-is
    // TODO: Integrate with your extractAppointmentDetails function/service
    return call;
}
async function extractLeadFromTranscript(transcript) {
    const prompt = `
Extract the following lead fields from this call transcript. Return a JSON object with these fields:
{
  call_id: string,
  agent_id: string,
  lead_type: string,
  status: string,
  client_name: string,
  client_email: string,
  client_address: string,
  job_description: string,
  job_type: string,
  appointment_date: string (YYYY-MM-DD),
  appointment_status: string,
  from_number: string
}
Transcript: """${transcript}"""
Return only the JSON object.
  `.trim();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that extracts structured lead data from call transcripts.' },
                { role: 'user', content: prompt }
            ]
        }),
    });
    const data = await response.json();
    log('GPT-4 raw response: ' + JSON.stringify(data));
    const content = data.choices?.[0]?.message?.content;
    try {
        return JSON.parse(content);
    }
    catch (e) {
        log('Failed to parse GPT-4 response: ' + content);
        return null;
    }
}
// Add GPT-4 extraction for contact info and summaries
async function extractContactInfoAndSummaries(transcript) {
    const prompt = `You are an intelligent assistant for a call receptionist system. Your task is to analyze a call transcript and extract structured information.

From the transcript below, extract the following fields:

1. **Call Summary** – A concise, 3–5 line summary of what the client said and what the call was about.
2. **Quick Summary** – A maximum 3-4 word summary for list view, focusing on outcome or action item. e.g. Service on 25-Jul-25, etc.
3. **Client Info:**
   - Client Name (if mentioned)
   - Email Address (if mentioned)
   - Site Address (if mentioned or described, including zipcode)
4. **Job Info:**
   - Job Description (brief summary of what service is being requested)
   - Job Type (one word about the type of job to be done)
   - Desired Date & Time (if client mentions any preferred date or time for the service)
5. **Intent Category** – Based on call content, classify the call into one of these categories:
   - \`"Service"\` – Client requests a normal service job at a scheduled/future timeline  
   - \`"Emergency"\` – Client requests immediate/emergency help or urgent attention  
   - \`"Quotation"\` – Client asks for a quotation or estimate (can include project details)  
   - \`"Inquiry"\` – Client inquires about your services, pricing, availability, or asks about an ongoing job, invoice, etc. This can be from new or existing clients  
   - \`"Others"\` – Non-client calls such as vendors, suppliers, sales, etc.

Return your response only in this JSON format:

{
  "call_summary": "<3–5 line summary of the call>",
  "quick_summary": "<1-line summary of key action or info>",
  "client_name": "<client name or null>",
  "client_email": "<email or null>",
  "client_address": "<address or null>",
  "intent_category": "<Service | Emergency | Quotation | Inquiry | Others>",
  "job_description": "<job description or null>",
  "job_type": "<job type or null>",
  "appointment_date": "<YYYY-MM-DD or null>",
  "appointment_start": "<time or null>",
  "appointment_end": "<time or null>"
}

Transcript: """${transcript}"""`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'You are an intelligent assistant for a call receptionist system that extracts structured information from call transcripts.' },
                { role: 'user', content: prompt }
            ]
        }),
    });
    const data = await response.json();
    log('GPT-4 comprehensive extraction response: ' + JSON.stringify(data));
    const content = data.choices?.[0]?.message?.content;
    try {
        return JSON.parse(content);
    }
    catch (e) {
        log('Failed to parse GPT-4 comprehensive extraction response: ' + content);
        return {};
    }
}
async function upsertLead(call, intent, agent_id, extracted) {
    if (!(intent === 'Service' || intent === 'Emergency' || intent === 'Quotation'))
        return 'skipped';
    if (await leadExists(call.call_id)) {
        log(`Lead for call ${call.call_id} already exists. Skipping.`);
        return 'skipped';
    }
    // Validate and clean appointment_date
    let appointmentDate = null;
    if (call.appointment_date) {
        try {
            const date = new Date(call.appointment_date);
            if (!isNaN(date.getTime())) {
                appointmentDate = date.toISOString().slice(0, 10);
            }
        }
        catch (e) {
            log(`Invalid appointment_date for call ${call.call_id}: ${call.appointment_date}`);
        }
    }
    // Normalize date fields for leads
    const leadRaw = {
        call_id: call.call_id,
        agent_id,
        lead_type: intent,
        status: 'Open',
        client_name: call.client_name || '',
        client_email: call.client_email || '',
        client_address: call.client_address || '',
        job_description: extracted?.job_description || call.job_description || '',
        job_type: extracted?.job_type || call.job_type || '',
        appointment_date: appointmentDate,
        appointment_status: call.appointment_status || '',
        from_number: call.from_number || '',
        created_at: call.start_timestamp || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    const lead = filterFields(normalizeDateFields(leadRaw, ['appointment_date', 'created_at', 'updated_at']), LEADS_FIELDS);
    const { error } = await supabase
        .from('leads')
        .upsert([lead], { onConflict: 'call_id' });
    if (error) {
        log(`Error upserting lead (call_id: ${call.call_id}): ${error.message}`);
        return 'failed';
    }
    log(`Upserted lead (call_id: ${call.call_id})`);
    return 'success';
}
// Update upsertCallLog to process transcript before insert
async function upsertCallLog(call, agent_id) {
    // Map RetellAI API response fields to call_logs fields
    // Fill blanks with null/defaults, and extract from transcript if needed
    // Extract contact info and summaries from transcript
    let extracted = {};
    if (call.transcript) {
        extracted = await extractContactInfoAndSummaries(call.transcript);
    }
    // Use AI-extracted intent category if available, otherwise fall back to local classification
    const intent = extracted.intent_category || classifyIntent(call.transcript || call.summary || '');
    call.intent = intent;
    // Map fields explicitly
    const mappedCall = {
        call_id: call.call_id,
        agent_id,
        call_status: call.call_status || null,
        start_timestamp: call.start_timestamp || null,
        end_timestamp: call.end_timestamp || null,
        transcript: call.transcript || null,
        recording_url: call.recording_url || null,
        call_type: call.call_type || null,
        from_number: call.from_number || null,
        appointment_status: call.appointment_status || null,
        appointment_date: extracted.appointment_date || call.appointment_date || null,
        appointment_time: extracted.appointment_start || call.appointment_time || null,
        client_name: extracted.client_name || call.client_name || null,
        client_address: extracted.client_address || call.client_address || null,
        client_email: extracted.client_email || call.client_email || null,
        notes: call.notes || null,
        user_sentiment: call.user_sentiment || null,
        call_successful: call.call_successful ?? null,
        in_voicemail: call.in_voicemail ?? null,
        processed: call.processed ?? false,
        created_at: call.created_at || call.start_timestamp || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        intent,
        summary: extracted.call_summary || null,
        quick_summary: extracted.quick_summary || null
    };
    // Always upsert if call_status is 'registered' or 'ongoing', even if already present
    if (await callExists(mappedCall.call_id)) {
        if (['registered', 'ongoing'].includes(mappedCall.call_status)) {
            const callLog = filterFields(normalizeDateFields(mappedCall, [
                'start_timestamp', 'end_timestamp', 'appointment_date', 'appointment_time',
                'appointment_start', 'appointment_end', 'created_at', 'updated_at'
            ]), CALL_LOGS_FIELDS);
            const { error } = await supabase
                .from('call_logs')
                .upsert([callLog], { onConflict: 'call_id' });
            if (error) {
                log(`Error upserting call log (call_id: ${mappedCall.call_id}): ${error.message}`);
                return 'failed';
            }
            log(`Upserted call log (call_id: ${mappedCall.call_id}) [status: ${mappedCall.call_status}]`);
            await upsertLead(mappedCall, intent, agent_id, extracted);
            return 'success';
        }
        else {
            log(`Call ${mappedCall.call_id} already exists. Skipping.`);
            await upsertLead(mappedCall, intent, agent_id, extracted);
            return 'skipped';
        }
    }
    const callLog = filterFields(normalizeDateFields(mappedCall, [
        'start_timestamp', 'end_timestamp', 'appointment_date', 'appointment_time',
        'appointment_start', 'appointment_end', 'created_at', 'updated_at'
    ]), CALL_LOGS_FIELDS);
    const { error } = await supabase
        .from('call_logs')
        .upsert([callLog], { onConflict: 'call_id' });
    if (error) {
        log(`Error upserting call log (call_id: ${mappedCall.call_id}): ${error.message}`);
        return 'failed';
    }
    log(`Upserted call log (call_id: ${mappedCall.call_id})`);
    await upsertLead(mappedCall, intent, agent_id, extracted);
    return 'success';
}
// Update all existing call logs with new mapping and intent
async function updateAllCallLogs() {
    log('=== Updating all existing call logs with new mapping and intent ===');
    // Fetch all call logs
    const { data: calls, error } = await supabase.from('call_logs').select('*');
    if (error) {
        log('Error fetching call_logs: ' + error.message);
        return;
    }
    let updated = 0, failed = 0;
    for (const call of calls) {
        // Re-classify intent
        const intent = classifyIntent(call.transcript || call.summary || '');
        // Map fields explicitly
        const mappedCall = {
            call_id: call.call_id,
            agent_id: call.agent_id,
            call_status: call.call_status || null,
            start_timestamp: call.start_timestamp || null,
            end_timestamp: call.end_timestamp || null,
            transcript: call.transcript || null,
            recording_url: call.recording_url || null,
            call_type: call.call_type || null,
            from_number: call.from_number || null,
            appointment_status: call.appointment_status || null,
            appointment_date: call.appointment_date || null,
            appointment_time: call.appointment_time || null,
            client_name: call.client_name || null,
            client_address: call.client_address || null,
            client_email: call.client_email || null,
            notes: call.notes || null,
            user_sentiment: call.user_sentiment || null,
            call_successful: call.call_successful ?? null,
            in_voicemail: call.in_voicemail ?? null,
            processed: call.processed ?? false,
            created_at: call.created_at || call.start_timestamp || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            intent
        };
        // Normalize date fields
        const callLog = filterFields(normalizeDateFields(mappedCall, [
            'start_timestamp', 'end_timestamp', 'appointment_date', 'appointment_time',
            'appointment_start', 'appointment_end', 'created_at', 'updated_at'
        ]), CALL_LOGS_FIELDS);
        const { error: upsertError } = await supabase
            .from('call_logs')
            .upsert([callLog], { onConflict: 'call_id' });
        if (upsertError) {
            log(`Error updating call log (call_id: ${call.call_id}): ${upsertError.message}`);
            failed++;
        }
        else {
            updated++;
        }
    }
    log(`Updated ${updated} call logs, ${failed} failed.`);
    log('=== Update complete ===');
}
async function main() {
    log('=== Script started ===');
    // Check for --update-all flag
    if (process.argv.includes('--update-all')) {
        await updateAllCallLogs();
        return;
    }
    // Only process the specified agent
    const agentIds = ['agent_c6b21934e271d99cf45355ea47'];
    log(`Processing only agent: ${agentIds[0]}`);
    let totalSuccess = 0, totalFail = 0, totalSkipped = 0, totalLeadSuccess = 0, totalLeadFail = 0, totalLeadSkipped = 0;
    for (const agentId of agentIds) {
        log(`\nProcessing agent: ${agentId}`);
        const calls = await fetchCallsFromApi(agentId);
        if (calls.length === 0) {
            log(`No calls found for agent ${agentId}`);
            continue;
        }
        let success = 0, fail = 0, skipped = 0, leadSuccess = 0, leadFail = 0, leadSkipped = 0;
        for (const call of calls) {
            const result = await upsertCallLog(call, agentId);
            if (result === 'success')
                success++;
            else if (result === 'failed')
                fail++;
            else
                skipped++;
        }
        log(`Agent ${agentId}: ${success} calls upserted, ${fail} failed, ${skipped} skipped.`);
        totalSuccess += success;
        totalFail += fail;
        totalSkipped += skipped;
    }
    log(`\n=== Script finished ===`);
    log(`Total: ${totalSuccess} calls upserted, ${totalFail} failed, ${totalSkipped} skipped.`);
}
main().catch(err => {
    // @ts-ignore
    log('Fatal error: ' + err);
    // @ts-ignore
    process.exit(1);
});
