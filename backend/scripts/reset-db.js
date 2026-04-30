import { closeDatabase, initDatabase, resetDatabase } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

try {
  logger.warn('Resetting database to latest schema');
  await resetDatabase();
  await initDatabase();
  logger.info('Database reset completed');
  await closeDatabase();
  process.exit(0);
} catch (error) {
  logger.error(error, 'Database reset failed');
  await closeDatabase();
  process.exit(1);
}
