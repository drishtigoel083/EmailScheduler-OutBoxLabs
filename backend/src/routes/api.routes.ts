import { Router } from 'express';
import {
  scheduleEmailHandler,
  listEmailsHandler,
  getEmailByIdHandler,
} from '../controllers/email.controller.js';
import { searchEmailsHandler } from '../controllers/search.controller.js';
import {
  slackConnectHandler,
  slackCallbackHandler,
  slackStatusHandler,
  slackDisconnectHandler,
} from '../controllers/slack.controller.js';
import { upsertUserHandler } from '../controllers/auth.controller.js';
import { getConfigHandler } from '../controllers/config.controller.js';

const router = Router();

// Auth Endpoints
router.post('/auth/upsert', upsertUserHandler);

// Config (public scheduling limits for dashboard display)
router.get('/config', getConfigHandler);

// Email Endpoints
router.post('/emails/schedule', scheduleEmailHandler);
router.get('/emails', listEmailsHandler);
router.get('/emails/search', searchEmailsHandler);
router.get('/emails/:id', getEmailByIdHandler);

// Slack OAuth Endpoints
router.get('/slack/connect', slackConnectHandler);
router.get('/slack/callback', slackCallbackHandler);
router.get('/slack/status', slackStatusHandler);
router.delete('/slack/disconnect', slackDisconnectHandler);

export default router;
