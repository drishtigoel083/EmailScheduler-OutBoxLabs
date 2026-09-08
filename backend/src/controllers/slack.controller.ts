import { Request, Response } from 'express';
import { getSlackAuthUrl, exchangeSlackCodeForToken } from '../services/slack.service.js';
import { prisma } from '../db/prisma.js';

export async function slackConnectHandler(req: Request, res: Response) {
  try {
    const email = req.query.email as string;

    if (!email) {
      return res.status(400).send('Missing email');
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).send('User not found');
    }

    const url = getSlackAuthUrl(user.id);

    return res.redirect(url);
  } catch (error: any) {
    console.error('Slack connect error:', error);
    return res.status(500).send(`Failed to connect Slack: ${error.message}`);
  }
}

export async function slackCallbackHandler(req: Request, res: Response) {
  try {
    const code = req.query.code as string;
    const stateUserId = (req.query.state as string) || 'default-user-id';

    if (!code) {
      return res.status(400).send('Missing code parameter from Slack OAuth callback');
    }

    const tokenRecord = await exchangeSlackCodeForToken(code, stateUserId);

    // Redirect back to frontend dashboard with success query param
    return res.send(`
      <html>
        <head><title>Slack Connected</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center;">
          <div style="background: #1e293b; padding: 2rem; border-radius: 12px; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <h2 style="color: #4ade80;">✅ Slack Connected!</h2>
            <p>Your Slack account has been successfully linked for email rate-limit alerts.</p>
            <script>
              setTimeout(() => {
                window.opener ? window.opener.postMessage('slack-connected', '*') : null;
                window.close();
              }, 2000);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('Slack OAuth callback error:', error);
    return res.status(500).send(`Failed to complete Slack OAuth: ${error.message}`);
  }
}

export async function slackStatusHandler(req: Request, res: Response) {
  try {
    const userId = (req.query.userId as string) || 'default-user-id';
    const token = await prisma.slackToken.findUnique({
      where: { userId },
    });

    return res.json({
      connected: Boolean(token && token.accessToken),
      authedUser: token?.authedUser || null,
      channelId: token?.channelId || null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
