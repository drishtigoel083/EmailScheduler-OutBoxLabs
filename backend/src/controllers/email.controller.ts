import { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { enqueueEmailJob } from '../services/queue.service.js';
import { indexEmailDocument } from '../services/elasticsearch.service.js';

export async function scheduleEmailHandler(req: Request, res: Response) {
  try {
    const {
      sender,
      recipient,
      subject,
      body,
      scheduledAt,
      startTime,
      delayMs,
      userId: bodyUserId,
    } = req.body;

    if (!sender || !recipient || !subject || !body) {
      return res.status(400).json({
        error: 'Missing required fields: sender, recipient, subject, body',
      });
    }

    // Determine target execution timestamp
    let targetTimeMs: number;
    if (scheduledAt) {
      targetTimeMs = new Date(scheduledAt).getTime();
    } else if (startTime) {
      targetTimeMs = new Date(startTime).getTime() + (Number(delayMs) || 0);
    } else if (delayMs) {
      targetTimeMs = Date.now() + Number(delayMs);
    } else {
      targetTimeMs = Date.now(); // Send immediately
    }

    const now = Date.now();
    const delay = Math.max(0, targetTimeMs - now);
    const targetScheduledDate = new Date(targetTimeMs);

    // Get or create user
    let userId = bodyUserId;
    if (!userId) {
      let defaultUser = await prisma.user.findFirst({ where: { email: sender } });
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: {
            email: sender,
            name: sender.split('@')[0],
          },
        });
      }
      userId = defaultUser.id;
    }

    // 1. Write to DB as Source of Truth
    const emailRecord = await prisma.email.create({
      data: {
        userId,
        sender,
        recipient,
        subject,
        body,
        status: 'SCHEDULED',
        scheduledAt: targetScheduledDate,
      },
    });

    // 2. Enqueue BullMQ delayed job by Email ID
    const jobId = await enqueueEmailJob(emailRecord.id, delay);

    // 3. Update DB record with bullmqJobId
    const updatedEmail = await prisma.email.update({
      where: { id: emailRecord.id },
      data: { bullmqJobId: jobId },
    });

    // 4. Index in Elasticsearch asynchronously
    indexEmailDocument(updatedEmail).catch((err) =>
      console.error('Initial ES indexing error:', err?.message || err)
    );

    return res.status(201).json({
      message: 'Email scheduled successfully',
      email: updatedEmail,
      delayMs: delay,
    });
  } catch (error: any) {
    console.error('Error in scheduleEmailHandler:', error);
    return res.status(500).json({ error: error.message || 'Failed to schedule email' });
  }
}

export async function listEmailsHandler(req: Request, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [total, emails] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return res.json({
      data: emails,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error in listEmailsHandler:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch emails' });
  }
}

export async function getEmailByIdHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    return res.json(email);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch email' });
  }
}
