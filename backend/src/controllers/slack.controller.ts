import { Request, Response } from 'express';
import {
  getSlackAuthUrl,
  exchangeSlackCodeForToken,
  disconnectSlack,
} from '../services/slack.service.js';
import { prisma } from '../db/prisma.js';

async function resolveUserId(req: Request): Promise<string | null> {
  const userId = req.query.userId as string | undefined;
  const email = req.query.email as string | undefined;

  if (userId) return userId;

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    return user?.id ?? null;
  }

  return null;
}

export async function slackConnectHandler(req: Request, res: Response) {
  try {
    const email = req.query.email as string;

    if (!email) {
      return res.status(400).send('Missing email query parameter');
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).send('User not found. Please sign in with Google first.');
    }

    const url = getSlackAuthUrl(user.id);
    return res.redirect(url);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Slack connect error:', message);
    return res.status(500).send(`Failed to connect Slack: ${message}`);
  }
}

export async function slackCallbackHandler(req: Request, res: Response) {
  try {
    const code = req.query.code as string;
    const stateUserId = req.query.state as string;

    if (!code) {
      return res.status(400).send('Missing code parameter from Slack OAuth callback');
    }

    if (!stateUserId) {
      return res.status(400).send('Missing state parameter (user id)');
    }

    await exchangeSlackCodeForToken(code, stateUserId);

    return res.send(`
      <html>
        <head><title>Slack Connected</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center;">
          <div style="background: #1e293b; padding: 2rem; border-radius: 12px; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <h2 style="color: #4ade80;">✅ Slack Connected!</h2>
            <p>Your Slack account has been successfully linked for email rate-limit alerts.</p>
            <script>
              setTimeout(() => {
                if (window.opener) window.opener.postMessage('slack-connected', '*');
                window.close();
              }, 1500);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Slack OAuth callback error:', message);
    return res.status(500).send(`Failed to complete Slack OAuth: ${message}`);
  }
}

export async function slackStatusHandler(req: Request, res: Response) {
  try {
    const userId = await resolveUserId(req);

    if (!userId) {
      return res.status(400).json({ error: 'Provide userId or email query parameter' });
    }

    const token = await prisma.slackToken.findUnique({
      where: { userId },
    });

    return res.json({
      connected: Boolean(token?.accessToken),
      authedUser: token?.authedUser ?? null,
      channelId: token?.channelId ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}

export async function slackDisconnectHandler(req: Request, res: Response) {
  try {
    const userId = (req.body?.userId as string) || (req.query.userId as string);

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    await disconnectSlack(userId);
    return res.json({ message: 'Slack disconnected successfully', connected: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}
