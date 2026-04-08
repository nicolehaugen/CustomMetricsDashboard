import express from 'express';
import syncRoutes from './routes/sync';
import statusRoutes from './routes/status';
import dataSourceRoutes from './routes/data-source';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/sync', syncRoutes);
app.use('/api/sync/status', statusRoutes);
app.use('/api/data-source', dataSourceRoutes);

const port = parseInt(process.env.PORT || '3001', 10);

app.listen(port, () => {
  console.log(`DORA Metrics Dashboard server listening on port ${port}`);
});

export default app;
