import { closeDatabase, initDatabase } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

try {
  await initDatabase();
  logger.info('Migrations completed');
  await closeDatabase();
  process.exit(0);
} catch (error) {
  logger.error(error, 'Migration failed');
  await closeDatabase();
  process.exit(1);
}
