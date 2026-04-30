import { Router } from 'express';
import {
  getBotStatus,
  connectBot,
  disconnectBot,
  cancelPendingBotPairing,
  testUserBot,
} from '../controllers/bot.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/status', getBotStatus);
router.post('/connect', connectBot);
router.post('/test', testUserBot);
router.post('/pending/cancel', cancelPendingBotPairing);
router.post('/disconnect/:botId', disconnectBot);

export default router;
