import { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { enqueueEmailJob } from '../services/queue.service.js';
import { indexEmailDocument } from '../services/elasticsearch.service.js';

/**
 * Resolve the application/Prisma user from the sender email.
 *
 * Your current frontend sends the logged-in user's email as `sender`,
 * so this keeps the existing frontend compatible.
 */
async function resolveUserFromSender(
  sender: string
) {
  const normalizedEmail = sender.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  return user;
}

export async function scheduleEmailHandler(
  req: Request,
  res: Response
) {
  try {
    const {
      sender,
      recipient,
      subject,
      body,
      scheduledAt,
      startTime,
      delayMs,
    } = req.body;

    if (!sender || !recipient || !subject || !body) {
      return res.status(400).json({
        error:
          'Missing required fields: sender, recipient, subject, body',
      });
    }

    /*
     * Resolve the actual Prisma User.
     *
     * We deliberately do NOT trust a userId supplied by the frontend.
     */
    const user = await resolveUserFromSender(sender);

    if (!user) {
      return res.status(404).json({
        error:
          `No application user found for sender ${sender}. ` +
          `Please sign in/upsert your user first.`,
      });
    }

    const userId = user.id;

    /*
     * Determine target execution timestamp.
     */
    let targetTimeMs: number;

    if (scheduledAt) {
      targetTimeMs = new Date(scheduledAt).getTime();
    } else if (startTime) {
      targetTimeMs =
        new Date(startTime).getTime() +
        (Number(delayMs) || 0);
    } else if (delayMs) {
      targetTimeMs =
        Date.now() + Number(delayMs);
    } else {
      targetTimeMs = Date.now();
    }

    if (!Number.isFinite(targetTimeMs)) {
      return res.status(400).json({
        error: 'Invalid scheduledAt/startTime value',
      });
    }

    const now = Date.now();

    const delay = Math.max(
      0,
      targetTimeMs - now
    );

    const targetScheduledDate =
      new Date(targetTimeMs);

    /*
     * 1. Store email in PostgreSQL.
     *
     * userId is always the real Prisma User.id.
     */
    const emailRecord = await prisma.email.create({
      data: {
        userId,
        sender: sender.trim(),
        recipient: recipient.trim(),
        subject,
        body,
        status: 'SCHEDULED',
        scheduledAt: targetScheduledDate,
      },
    });

    /*
     * 2. Add email to BullMQ.
     */
    const jobId = await enqueueEmailJob(
      emailRecord.id,
      delay
    );

    /*
     * 3. Store BullMQ job ID.
     */
    const updatedEmail = await prisma.email.update({
      where: {
        id: emailRecord.id,
      },
      data: {
        bullmqJobId: jobId,
      },
    });

    /*
     * 4. Index in Elasticsearch.
     */
    indexEmailDocument(updatedEmail).catch(
      (err) =>
        console.error(
          'Initial ES indexing error:',
          err?.message || err
        )
    );

    console.log(
      `📧 [Email] Scheduled ${emailRecord.id} ` +
        `for user ${userId} (${user.email}) ` +
        `→ ${recipient}`
    );

    return res.status(201).json({
      message: 'Email scheduled successfully',
      email: updatedEmail,
      delayMs: delay,
    });
  } catch (error: any) {
    console.error(
      '❌ Error in scheduleEmailHandler:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to schedule email',
    });
  }
}

/**
 * List emails for ONE user.
 *
 * Required:
 *   ?userId=<Prisma User.id>
 *
 * Or:
 *   ?email=<user email>
 */
export async function listEmailsHandler(
  req: Request,
  res: Response
) {
  try {
    const status =
      req.query.status as string | undefined;

    const userId =
      req.query.userId as string | undefined;

    const email =
      req.query.email as string | undefined;

    let resolvedUserId = userId;

    /*
     * Allow email as an alternative to userId.
     */
    if (!resolvedUserId && email) {
      const user = await prisma.user.findUnique({
        where: {
          email: email.trim().toLowerCase(),
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      resolvedUserId = user.id;
    }

    /*
     * NEVER return all users' emails.
     */
    if (!resolvedUserId) {
      return res.status(400).json({
        error:
          'userId or email is required',
      });
    }

    /*
     * Validate that the user exists.
     */
    const user = await prisma.user.findUnique({
      where: {
        id: resolvedUserId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const page = Math.max(
      1,
      parseInt(
        (req.query.page as string) || '1',
        10
      )
    );

    const requestedLimit = parseInt(
      (req.query.limit as string) || '20',
      10
    );

    const limit = Math.min(
      100,
      Math.max(1, requestedLimit)
    );

    const skip =
      (page - 1) * limit;

    const where: any = {
      userId: resolvedUserId,
    };

    if (status) {
      where.status = status;
    }

    const [total, emails] =
      await Promise.all([
        prisma.email.count({
          where,
        }),

        prisma.email.findMany({
          where,
          orderBy: {
            createdAt: 'desc',
          },
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
        totalPages:
          Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error(
      '❌ Error in listEmailsHandler:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to fetch emails',
    });
  }
}

/**
 * Get one email, but only if it belongs to the requested user.
 */
export async function getEmailByIdHandler(
  req: Request,
  res: Response
) {
  try {
    const { id } = req.params;

    const userId =
      req.query.userId as string | undefined;

    const emailAddress =
      req.query.email as string | undefined;

    let resolvedUserId = userId;

    if (!resolvedUserId && emailAddress) {
      const user = await prisma.user.findUnique({
        where: {
          email:
            emailAddress
              .trim()
              .toLowerCase(),
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      resolvedUserId = user.id;
    }

    if (!resolvedUserId) {
      return res.status(400).json({
        error:
          'userId or email is required',
      });
    }

    const email = await prisma.email.findFirst({
      where: {
        id,
        userId: resolvedUserId,
      },
    });

    if (!email) {
      return res.status(404).json({
        error: 'Email not found',
      });
    }

    return res.json(email);
  } catch (error: any) {
    console.error(
      '❌ Error in getEmailByIdHandler:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to fetch email',
    });
  }
}