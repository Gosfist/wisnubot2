import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { isOriginAllowed } from './config/env.js';
import { logger } from './utils/logger.js';
import { baileysManager } from './services/baileys.service.js';
import { realtimeService } from './services/realtime.service.js';
import {
  SESSION_COOKIE_NAME,
  parseCookieHeader,
} from './services/auth-session.service.js';
import { getAuthenticatedUserFromToken } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rate-limiters.js';

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

app.set('trust proxy', 1);

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin tidak diizinkan oleh CORS'));
  },
  credentials: true,
};

// Socket.io
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin tidak diizinkan oleh CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

// Pass Socket.io to Baileys manager
baileysManager.setIO(io);
realtimeService.setIO(io);

io.use(async (socket, next) => {
  try {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      throw new Error('Token tidak ditemukan');
    }

    const user = await getAuthenticatedUserFromToken(token);
    socket.data.user = user;
    next();
  } catch (err) {
    next(err);
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  const user = socket.data.user;
  const userRoom = `user_${user.id}`;
  socket.join(userRoom);
  logger.info(`Socket connected: ${socket.id} user=${user.id}`);

  // Kept for old clients, but the server only allows joining the authenticated room.
  socket.on('join', () => {
    socket.join(userRoom);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Middleware
app.use(cors(corsOptions));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cookieParser());
app.use('/api', apiLimiter);
app.use((req, res, next) => {
  const limit = req.method === 'POST' && req.path === '/api/settings/import'
    ? '200mb'
    : '1mb';
  express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(csrfProtection);

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
