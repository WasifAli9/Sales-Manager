import type { NextFunction, Request, Response } from 'express';

/**
 * Blocks non-owner users from write operations.
 * Must be used AFTER authMiddleware.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (req.user.role !== 'owner') {
    res.status(403).json({ error: 'Only account owners can perform this action.' });
    return;
  }
  next();
}
