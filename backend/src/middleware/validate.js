import { validationResult } from 'express-validator';

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validasi gagal',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}
