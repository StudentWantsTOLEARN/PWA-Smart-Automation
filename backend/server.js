const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

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
  }

  // Send pending command back to ESP32 in HTTP response and clear queue
  const commandToSend = pendingCommand;
  pendingCommand = null;
  res.json({ success: true, command: commandToSend });
});

// Route triggered when tapping buttons on your Vercel frontend
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
  console.log(` Mode: Outbound ESP32 Telemetry Receiver`);
  console.log(`================================================`);
});