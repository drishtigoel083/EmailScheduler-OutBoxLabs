import { Request, Response } from 'express';
import { getRateLimitConfig } from '../services/rateLimiter.service.js';

export async function getConfigHandler(_req: Request, res: Response) {
  return res.json(getRateLimitConfig());
}
