const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const ZT_API_BASE = 'https://services-demo.zentrades.pro';
const OB_APP_URL = 'https://ob-demo.zentrades.pro/3';

const loginPayload = {
  username: 'bajrang@zentrades.pro',
  password: 'Test@123',
  rememberMe: true
};

function getTimestamp() {
  return Date.now();
}

async function createBooking() {
  try {
    // 1. LOGIN
    const loginUrl = `${ZT_API_BASE}/api/auth/login?timestamp=${getTimestamp()}`;
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json;charset=UTF-8',
        'origin': 'https://demo-app.zentrades.pro',
        'priority': 'u=1, i',
        'referer': 'https://demo-app.zentrades.pro/',
        'request-from': 'WEB_APP',
        'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(loginPayload)
    });

    if (!loginResponse.ok) throw new Error('Login failed');
    const loginData = await loginResponse.json();
    const token = loginData?.result?.['access-token'];
    if (!token) {
      console.error('Full login response:', loginData);
      throw new Error('Access token not found');
    }

    console.log('✅ Logged in successfully');

    // 2. BOOKING PAYLOAD
    const bookingPayload = {
      startBookingTime: "2025-06-14T02:30:00.000Z",
      endBookingTime: "2025-06-14T03:15:00.000Z",
      bookDate: "2025-06-14T03:15:00.000Z",
      name: "bajrang Pathak",
      email: "bajrang.pathak+obAPI@zentrades.pro",
      phoneNumber: "(123) 456-7890",
      addressLineOne: "230 5th Avenue",
      addressLineTwo: " ",
      city: "New York",
      state: "NY",
      country: "US",
      zipCode: "10001",
      companyId: 3,
      description: "Inspection regular fire",
      workCodeId: 1, // 🔁 Replace with a valid work code ID for companyId 3
      workCodeName: "This is a work code",
      source: "Web"
    };

    // 3. CREATE BOOKING
    const bookingResponse = await fetch(`${ZT_API_BASE}/api/ob/obr/book/`, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'origin': OB_APP_URL,
        'referer': OB_APP_URL,
        'timezone-offset': '-330',
        'user-agent': 'Mozilla/5.0',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(bookingPayload)
    });

    const bookingResult = await bookingResponse.json();

    if (bookingResponse.ok) {
      console.log('✅ Booking Created:', bookingResult);
    } else {
      console.error('❌ Booking Failed:', bookingResult);
    }

  } catch (err) {
    console.error('⚠️ Error:', err.message);
  }
}

createBooking();
