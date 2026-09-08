import express from 'express';
import cors from 'cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';

import { config } from './config/index.js';
import apiRouter from './routes/api.routes.js';
import { emailQueue } from './services/queue.service.js';
import { startEmailWorker } from './workers/email.worker.js';
import { reconcileJobsOnBoot } from './services/reconciliation.service.js';
import { initElasticsearchIndex } from './services/elasticsearch.service.js';

const app = express();

app.use(cors());
app.use(express.json());

// Set up Bull Board for Queue Visibility
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue) as any],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Mount API Routes
app.use('/api', apiRouter);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'email-scheduler-backend',
    env: config.nodeEnv,
    bullBoardUrl: `http://localhost:${config.port}/admin/queues`,
  });
});

async function main() {
  try {
    // 1. Initialize Elasticsearch index if available
    await initElasticsearchIndex();

    // 2. Perform boot reconciliation for scheduled jobs
    await reconcileJobsOnBoot();

    // 3. Start BullMQ Worker
    startEmailWorker();

    // 4. Start HTTP Server
    app.listen(config.port, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Backend service listening on port ${config.port}`);
      console.log(`📊 Health Check: http://localhost:${config.port}/api/health`);
      console.log(`📈 Bull Board Live Dashboard: http://localhost:${config.port}/admin/queues`);
      console.log(`======================================================\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
