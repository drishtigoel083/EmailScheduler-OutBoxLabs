import axios from 'axios';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';

export async function sendSlackRateLimitAlert(
  userId: string,
  sender: string,
  currentCount: number,
  maxLimit: number
): Promise<boolean> {
  try {
    const slackToken = await prisma.slackToken.findUnique({
      where: { userId },
    });

    if (!slackToken || !slackToken.accessToken) {
      console.log(`ℹ️  [Slack] User ${userId} has not connected Slack. Skipping rate-limit notification.`);
      return false;
    }

    const channel = slackToken.channelId || slackToken.authedUser;
    if (!channel) {
      console.log(`ℹ️  [Slack] No valid channel ID for user ${userId}. Skipping alert.`);
      return false;
    }

    const messagePayload = {
      channel,
      text: `🚨 *Rate Limit Exceeded Alert*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Hourly Rate Limit Exceeded',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sender:*\n\`${sender}\``,
            },
            {
              type: 'mrkdwn',
              text: `*Usage:*\n\`${currentCount} / ${maxLimit}\` emails/hr`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⚠️ Additional outgoing emails for \`${sender}\` are automatically rescheduled to the next hour window. Zero emails dropped.`,
          },
        },
      ],
    };

    const response = await axios.post('https://slack.com/api/chat.postMessage', messagePayload, {
      headers: {
        Authorization: `Bearer ${slackToken.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.data.ok) {
      console.log(`✅ [Slack] Alert message posted successfully to Slack channel ${channel}.`);
      return true;
    } else {
      console.error(`❌ [Slack] Failed to post message: ${response.data.error}`);
      return false;
    }
  } catch (error: any) {
    console.error('❌ [Slack] Error firing Slack alert:', error?.message || error);
    return false; // Guarantee worker does not crash
  }
}

export function getSlackAuthUrl(state: string): string {
  const scopes = 'chat:write,commands,channels:read';
  console.log('Slack Client ID loaded:', config.slack.clientId);
  return `https://slack.com/oauth/v2/authorize?client_id=${config.slack.clientId}&scope=${encodeURIComponent(
    scopes
  )}&redirect_uri=${encodeURIComponent(config.slack.redirectUri)}&state=${state}`;
}

export async function exchangeSlackCodeForToken(code: string, userId: string) {
  const params = new URLSearchParams();
  params.append('client_id', config.slack.clientId);
  params.append('client_secret', config.slack.clientSecret);
  params.append('code', code);
  params.append('redirect_uri', config.slack.redirectUri);

  const response = await axios.post('https://slack.com/api/oauth.v2.access', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.data.ok) {
    throw new Error(`Slack OAuth Error: ${response.data.error}`);
  }

  const { access_token, authed_user, incoming_webhook } = response.data;
  const channelId = incoming_webhook?.channel_id || authed_user?.id;

  const tokenRecord = await prisma.slackToken.upsert({
    where: { userId },
    update: {
      accessToken: access_token,
      authedUser: authed_user?.id || null,
      channelId: channelId || null,
    },
    create: {
      userId,
      accessToken: access_token,
      authedUser: authed_user?.id || null,
      channelId: channelId || null,
    },
  });

  return tokenRecord;
}
