import { Router } from 'express';
import { body } from 'express-validator';
import { listGroups, joinGroup, syncGroups, toggleGroup, deleteGroup } from '../controllers/group.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', listGroups);
router.post('/join', [
  body('inviteLink').trim().notEmpty().withMessage('Link undangan wajib diisi'),
  validate,
], joinGroup);
router.post('/sync', syncGroups);
router.patch('/:groupId/toggle', toggleGroup);
router.delete('/:groupId', deleteGroup);

export default router;
