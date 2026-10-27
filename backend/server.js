const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webpush = require('web-push');

// Dynamic port configuration for Render cloud deployment
const APP_PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// Enable Cross-Origin Resource Sharing for Vercel frontend & clients
app.use(cors({ origin: '*' }));
app.use(express.json());

// Enable Socket.IO CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ==========================================
// Web Push Configuration (VAPID Keys)
// ==========================================
const publicVapidKey = 'BADGpn1laCjfy7PPMykF44e-mO_5vv3vT7WdarD1rkrLJIVU6jSawO142Nb02GoWwDbxdLmpMyv82KTE_ZLIRkA';
const privateVapidKey = '6viIY9s1R204yOKQ59iuKMIO3fUJCtTP9Apw03mL82w';

webpush.setVapidDetails(
  'mailto:kiann.natividad@example.com',
  publicVapidKey,
  privateVapidKey
);

// In-memory store for registered PWA browser push subscriptions
let pushSubscribers = [];

// Endpoint for frontend to register its push subscription
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (subscription && subscription.endpoint) {
    if (!pushSubscribers.find(sub => sub.endpoint === subscription.endpoint)) {
      pushSubscribers.push(subscription);
      console.log('[Web Push]: New device successfully subscribed to background notifications.');
    }
    res.status(201).json({ success: true, message: 'Subscribed successfully' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid subscription object' });
  }
});

// Helper function to broadcast background push notifications to all subscribed devices
const sendPushAlert = (title, body) => {
  const payload = JSON.stringify({ title, body });
  pushSubscribers.forEach((sub, index) => {
    webpush.sendNotification(sub, payload).catch(err => {
      console.error('[Web Push Error]: Failed to send to subscriber', err);
      if (err.statusCode === 404 || err.statusCode === 410) {
        pushSubscribers.splice(index, 1);
      }
    });
  });
};

// Root Health Check Route for Render
app.get('/', (req, res) => {
  res.send('Smart Home Automation Backend is live and running.');
});

let latestTelemetry = {
  lamp: false,
  fan: false,
  kettle: false,
  kettleMode: "Off",
  kettleRem: 0,
  rice: false,
  riceAlarm: false,
  riceRem: 0,
  ricePct: 0,
  temp: 0.0,
  csiEnabled: true,
  csiTest: false,
  csiTestRem: 0,
  csiMotion: false,
  csiScore: 0.0,
  espOnline: false
};

let pendingCommand = null;
let lastEspHeartbeat = 0;

let lastRiceAlarmState = false;
let lastKettleState = false;

// Heartbeat interval: Mark ESP32 offline if no ping is received within 8 seconds
setInterval(() => {
  if (Date.now() - lastEspHeartbeat > 8000 && latestTelemetry.espOnline) {
    latestTelemetry.espOnline = false;
    io.emit('telemetry', latestTelemetry);
  }
}, 2000);

// Endpoint for ESP32 to POST outbound telemetry and retrieve pending commands
app.post('/api/telemetry', (req, res) => {
  lastEspHeartbeat = Date.now();
  
  if (req.body && Object.keys(req.body).length > 0) {
    latestTelemetry = { ...latestTelemetry, ...req.body, espOnline: true };
    io.emit('telemetry', latestTelemetry);

    // --- Background Push Trigger Logic ---
    if (latestTelemetry.riceAlarm && !lastRiceAlarmState) {
      sendPushAlert("🍚 Rice is Ready!", "The smart rice cooker has finished its cycle.");
    }
    lastRiceAlarmState = latestTelemetry.riceAlarm;

    if (!latestTelemetry.kettle && lastKettleState) {
      sendPushAlert("🫖 Kettle Finished", "Your hot water profile has reached completion.");
    }
    lastKettleState = latestTelemetry.kettle;
  }

  const commandToSend = pendingCommand;
  pendingCommand = null;
  res.json({ success: true, command: commandToSend });
});

app.get('/api/control/:command', (req, res) => {
  const { command } = req.params;
  console.log(`[Command Queued]: /${command}`);
  pendingCommand = command;
  res.json({ success: true, commandQueued: command });
});

io.on('connection', (socket) => {
  console.log(`[Web Socket Connected]: Client ID ${socket.id}`);
  socket.emit('telemetry', latestTelemetry);
});

server.listen(APP_PORT, () => {
  console.log(`================================================`);
  console.log(` Backend running on port ${APP_PORT}`);
  console.log(` Mode: Outbound ESP32 Telemetry & Web Push Engine`);
  console.log(`================================================`);
});