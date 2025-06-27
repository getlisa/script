const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3001;
const ST_API_BASE = 'https://api.servicetrade.com/api';

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Helper function to make HTTP requests without fetch
const makeRequest = (url, options) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: () => data,
          json: () => JSON.parse(data)
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
};

app.post('/proxy/auth', async (req, res) => {
  const { username, password } = req.body;
  try {
    const response = await makeRequest(`${ST_API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (response.status !== 200) {
      return res.status(response.status).json({ error: 'Authentication failed' });
    }

    const setCookie = response.headers['set-cookie'];
    const match = setCookie && setCookie[0] && setCookie[0].match(/PHPSESSID=([^;]+)/);
    const sessionId = match ? match[1] : null;

    if (!sessionId) {
      return res.status(401).json({ error: 'Session ID not found' });
    }

    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`ServiceTrade proxy server running on http://localhost:${PORT}`);
}); 
