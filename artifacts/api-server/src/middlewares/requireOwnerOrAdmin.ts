import type { Request, Response, NextFunction } from "express";

/** Allow the request only if the user is logged in and is an owner or admin. */
export function requireOwnerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.user.role !== "owner" && req.user.role !== "admin") {
    res.status(403).json({ error: "Owner or admin access required" });
    return;
  }
  next();
}
