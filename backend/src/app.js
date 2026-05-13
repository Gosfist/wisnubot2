import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { baileysManager } from './services/baileys.service.js';
import { realtimeService } from './services/realtime.service.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import appRoutes from './routes/app.routes.js';
import botRoutes from './routes/bot.routes.js';
import groupRoutes from './routes/group.routes.js';
import broadcastRoutes from './routes/broadcast.routes.js';
import customerServiceRoutes from './routes/customer-service.routes.js';
import csButtonRoutes from './routes/cs-button.routes.js';
import csStockRoutes from './routes/cs-stock.routes.js';
import csPaymentRoutes from './routes/cs-payment.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import ownerRoutes from './routes/owner.routes.js';
import pushContactRoutes from './routes/push-contact.routes.js';
import googleAccountRoutes from './routes/google-account.routes.js';
import geminiPriceRoutes from './routes/gemini-price.routes.js';

const app = express();
const httpServer = createServer(app);

// Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Pass Socket.io to Baileys manager
baileysManager.setIO(io);
realtimeService.setIO(io);

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Client joins their user room for targeted events
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    logger.info(`Socket ${socket.id} joined room user_${userId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded images
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/app', appRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/customer-service', customerServiceRoutes);
app.use('/api/cs-buttons', csButtonRoutes);
app.use('/api/cs-stocks', csStockRoutes);
app.use('/api/cs-payments', csPaymentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/push-contact', pushContactRoutes);
app.use('/api/google-accounts', googleAccountRoutes);
app.use('/api/gemini-prices', geminiPriceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

export { httpServer, io };
