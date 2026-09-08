import { Request, Response } from 'express';
import { searchEmailsInES } from '../services/elasticsearch.service.js';
import { prisma } from '../db/prisma.js';

export async function searchEmailsHandler(req: Request, res: Response) {
  try {
    const q = (req.query.q as string) || '';
    const status = req.query.status as string | undefined;

    // Try Elasticsearch search first
    const esResult = await searchEmailsInES(q, status);

    if (!esResult.error && esResult.data) {
      return res.json({
        source: 'elasticsearch',
        total: esResult.total,
        data: esResult.data,
      });
    }

    // Fallback: Postgres DB search if ES is unavailable
    console.log('⚠️ ES search failed or offline, performing Postgres fallback search...');
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (q) {
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { recipient: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ];
    }

    const dbEmails = await prisma.email.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json({
      source: 'postgres_fallback',
      total: dbEmails.length,
      data: dbEmails,
    });
  } catch (error: any) {
    console.error('Search handler error:', error);
    return res.status(500).json({ error: error.message || 'Search failed' });
  }
}
