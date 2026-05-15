import { assertSecurityConfig, config } from './src/config/env.js';
import { initDatabase } from './src/config/database.js';
import { httpServer } from './src/app.js';
import { baileysManager } from './src/services/baileys.service.js';
import { schedulerService } from './src/services/scheduler.service.js';
import { logger } from './src/utils/logger.js';

let shuttingDown = false;

async function start() {
  try {
    logger.info('=== WisnuBot API Starting ===');

    assertSecurityConfig();

    // 1. Initialize database
    await initDatabase();

    // 2. Start HTTP + WebSocket server
    httpServer.listen(config.port, () => {
      logger.info(`🚀 Server running on http://localhost:${config.port}`);
      logger.info(`📡 Socket.io ready`);
    });

    // 3. Load scheduled broadcasts
    await schedulerService.loadAll();

    // 4. Reconnect previously online bots
    await baileysManager.reconnectAll();

    logger.info('=== WisnuBot API Ready ===');
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info(`Shutting down (${signal})...`);

  httpServer.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

// Graceful shutdown
process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

start();
