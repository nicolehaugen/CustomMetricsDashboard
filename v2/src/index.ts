import express from 'express';
import { config } from './config';
import syncRouter from './routes/sync';
import statusRouter from './routes/status';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

app.use('/api/sync', syncRouter);
app.use('/api/sync/status', statusRouter);

app.listen(config.port, () => {
  console.log(`Sync server running on port ${config.port}`);
});

export default app;
