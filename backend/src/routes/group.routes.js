import { Router } from 'express';
import { body } from 'express-validator';
import {
  addPushExclusion,
  deleteGroup,
  deletePushExclusion,
  joinGroup,
  listGroups,
  listPushMembers,
  listPushExclusions,
  syncGroups,
  toggleGroup,
} from '../controllers/group.controller.js';
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
router.get('/:groupId/push-members', listPushMembers);
router.get('/:groupId/push-exclusions', listPushExclusions);
router.post('/:groupId/push-exclusions', [
  body('phoneNumber').trim().notEmpty().withMessage('Nomor wajib diisi'),
  validate,
], addPushExclusion);
router.delete('/:groupId/push-exclusions/:exclusionId', deletePushExclusion);
router.patch('/:groupId/toggle', toggleGroup);
router.delete('/:groupId', deleteGroup);

export default router;
