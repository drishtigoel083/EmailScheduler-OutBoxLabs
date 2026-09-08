import { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';


export async function upsertUserHandler(req: Request, res: Response) {
  try {
    const { email, name, avatarUrl } = req.body as {
      email: string;
      name?: string;
      avatarUrl?: string;
    };

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: name || undefined,
        avatarUrl: avatarUrl || undefined,
      },
      create: {
        email,
        name: name ?? null,
        avatarUrl: avatarUrl ?? null,
      },
    });

    return res.json(user);
  } catch (error: any) {
    console.error('[Auth] upsertUser error:', error);
    return res.status(500).json({ error: error.message });
  }
}
