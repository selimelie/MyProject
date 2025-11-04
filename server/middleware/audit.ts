import type { Request, Response, NextFunction } from 'express';
import { auditLog, AuditAction } from '../logger';

// Middleware to automatically audit certain actions
export function auditMiddleware(action: AuditAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    // Capture original res.json to log after response
    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      // Only log successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        auditLog({
          action,
          userId: user?.id,
          shopId: user?.shopId,
          details: {
            method: req.method,
            path: req.path,
            body: req.body,
            params: req.params,
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });
      }
      return originalJson(body);
    };
    
    next();
  };
}
