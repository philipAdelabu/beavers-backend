// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

console.log("before middleware")
// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log("before const routes")
// Import routes
const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/client.routes');
const artisanRoutes = require('./routes/artisan.routes');
const jobRoutes = require('./routes/job.routes');
const paymentRoutes = require('./routes/payment.routes');

const adminRoutes = require('./routes/admin.routes');
const locationRoutes = require('./routes/location.routes');
const boqRoutes = require('./routes/boq.routes');
const warehouseRoutes = require('./routes/warehouse.routes');

console.log("before services")
// Import services
const { initializeDatabase } = require('./config/database');
const { initializeRedis } = require('./config/redis');
const { setupSocketHandlers } = require('./socket/socket.handlers');

console.log("before routes")
// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/artisans', artisanRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/location', locationRoutes);
app.use('/api/v1/boq', boqRoutes);
app.use('/api/v1/warehouse', warehouseRoutes);


console.log("Health Check")
// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Initialize services and start server
const startServer = async () => {
  try {
    await initializeDatabase();
    await initializeRedis();
    setupSocketHandlers(io);
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

console.log("server start")
startServer();

module.exports = { app, io };