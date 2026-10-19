const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');

// Dynamic port configuration for Render cloud deployment
const APP_PORT = process.env.PORT || 3000;
const ESP32_IP = process.env.ESP32_IP || 'http://192.168.1.99';

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

async function pollESP32() {
  try {
    const response = await axios.get(`${ESP32_IP}/api/status`, { timeout: 3500 });
    latestTelemetry = { ...response.data, espOnline: true };
  } catch (error) {
    if (latestTelemetry.espOnline) {
      console.error(`[ESP32 Offline]: ${error.message}`);
    }
    latestTelemetry.espOnline = false;
  }
  io.emit('telemetry', latestTelemetry);
}

// Poll ESP32 every 800ms
setInterval(pollESP32, 800);

app.get('/api/control/:command', async (req, res) => {
  const { command } = req.params;
  console.log(`[Command Sent]: Sending /${command} to ESP32...`);
  try {
    await axios.get(`${ESP32_IP}/${command}`, { timeout: 3500 });
    await pollESP32();
    res.json({ success: true, commandExecuted: command });
  } catch (error) {
    console.error(`[Command Failed]: /${command} - ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to communicate with ESP32' });
  }
});

io.on('connection', (socket) => {
  console.log(`[Web Socket Connected]: Client ID ${socket.id}`);
  socket.emit('telemetry', latestTelemetry);
});

server.listen(APP_PORT, () => {
  console.log(`================================================`);
  console.log(` Backend running on port ${APP_PORT}`);
  console.log(` Target ESP32 Node: ${ESP32_IP}`);
  console.log(`================================================`);
});