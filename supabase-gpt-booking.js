// supabase-gpt-booking.js

const { createClient } = require('@supabase/supabase-js');

// === Supabase Configuration - UPDATED ===
const SUPABASE_URL = 'https://tpvserzjhmyxjssabokm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdnNlcnpqaG15eGpzc2Fib2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjgwMjcsImV4cCI6MjA2NTI0NDAyN30.4cYrSzhNDG-Sd48_UO0rw2fnKtI5PasZaeoh8E4OLQg';
const SUPABASE_TABLE = 'call_logs';
const TRANSCRIPT_COLUMN = 'transcript';
const ID_COLUMN = 'id';
const PROCESSED_COLUMN = 'processed';

// === OpenAI API Key - UPDATED ===
const OPENAI_API_KEY = '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';

const BOOKING_API_URL = 'https://services-demo.zentrades.pro/api/ob/obr/book/';
const POLL_INTERVAL_MS = 60000; // 1 minute

const ZENTRADES_TOKEN_TABLE = 'zentrades_tokens';
const ZENTRADES_TOKEN_USERNAME = 'bajrang@zentrades.pro';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getLatestUnprocessedTranscript() {
  // Get the latest unprocessed call log
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select(`*, ${TRANSCRIPT_COLUMN}`)
    .eq(PROCESSED_COLUMN, false)
    .order(ID_COLUMN, { ascending: false })
    .limit(1);
  if (error) {
    console.error('Supabase fetch error:', error);
    return null;
  }
  return data && data[0] ? data[0] : null;
}

async function markAsProcessed(id) {
  const { error } = await supabase
    .from(SUPABASE_TABLE)
    .update({ [PROCESSED_COLUMN]: true })
    .eq(ID_COLUMN, id);
  if (error) {
    console.error(`Failed to mark id ${id} as processed:`, error);
  }
}

async function extractBookingData(transcript) {
  // Updated prompt to request the exact booking API payload fields and formats
  const prompt = `Extract booking information from this call transcript: "${transcript}". Return a JSON object with the following fields and formats for a booking API:
{
  startBookingTime: ISO8601 string (e.g. "2025-06-14T02:30:00.000Z"),
  endBookingTime: ISO8601 string (e.g. "2025-06-14T03:15:00.000Z"),
  bookDate: ISO8601 string (e.g. "2025-06-14T03:15:00.000Z"),
  name: string,
  email: string,
  phoneNumber: string,
  addressLineOne: string,
  addressLineTwo: string,
  city: string,
  state: string,
  country: string,
  zipCode: string,
  companyId: integer (use 3 if not specified),
  description: string,
  workCodeId: integer (use 1 if not specified),
  workCodeName: string (use 'This is a work code' if not specified),
  source: string (use 'Web')
}
Return only the JSON object.`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that extracts booking data from call transcripts.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse GPT-4 response:', content);
    return null;
  }
}

function mapToBookingPayload(gptData) {
  // Map GPT-4 output to the exact booking API payload structure
  // Add defaults if fields are missing
  const payload = {
    startBookingTime: gptData.startBookingTime || "2025-06-14T02:30:00.000Z",
    endBookingTime: gptData.endBookingTime || "2025-06-14T03:15:00.000Z",
    bookDate: gptData.bookDate || "2025-06-14T03:15:00.000Z",
    name: gptData.name || "Unknown",
    email: gptData.email || "unknown@example.com",
    phoneNumber: gptData.phoneNumber || "",
    addressLineOne: gptData.addressLineOne || "",
    addressLineTwo: gptData.addressLineTwo || "",
    city: gptData.city || "",
    state: gptData.state || "",
    country: gptData.country || "US",
    zipCode: gptData.zipCode || "",
    companyId: gptData.companyId || 3,
    description: gptData.description || "",
    workCodeId: gptData.workCodeId || 1,
    workCodeName: gptData.workCodeName || "This is a work code",
    source: gptData.source || "Web"
  };
  console.log('Mapped booking payload:', payload);
  return payload;
}

async function getZentradesAccessToken() {
  // Get the latest access_token for the given username
  const { data, error } = await supabase
    .from(ZENTRADES_TOKEN_TABLE)
    .select('access_token')
    .eq('username', ZENTRADES_TOKEN_USERNAME)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error || !data || !data[0]) {
    console.error('Failed to fetch Zentrades access token:', error);
    return null;
  }
  return data[0].access_token;
}

async function createBooking(bookingData) {
  // Fetch the Zentrades access token from Supabase
  const token = await getZentradesAccessToken();
  if (!token) {
    console.error('No Zentrades access token available.');
    return null;
  }
  // Call your booking API with the token
  const response = await fetch(BOOKING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(bookingData)
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('Booking API error:', data);
    return null;
  }
  return data;
}

async function main() {
  console.log('--- Supabase-GPT-Booking: Single Run ---');
  const row = await getLatestUnprocessedTranscript();
  if (!row) {
    console.log('No unprocessed call logs found.');
    return;
  }
  const transcript = row[TRANSCRIPT_COLUMN];
  const id = row[ID_COLUMN];
  console.log(`Found unprocessed transcript. ID: ${id}`);
  if (!transcript) {
    console.log('Warning: Transcript is empty for this row, but proceeding to process it.');
  }
  console.log('Transcript content:', transcript);
  console.log('Extracting booking data from transcript using GPT-4...');
  const gptData = await extractBookingData(transcript);
  if (gptData) {
    const bookingPayload = mapToBookingPayload(gptData);
    console.log('Booking data extracted:', bookingPayload);
    console.log('Creating booking via Zentrades API...');
    const bookingResult = await createBooking(bookingPayload);
    console.log('Booking API result:', bookingResult);
  } else {
    console.log('Failed to extract booking data from transcript.');
  }
  await markAsProcessed(id);
  console.log('Marked as processed. Done.');
}

main(); 