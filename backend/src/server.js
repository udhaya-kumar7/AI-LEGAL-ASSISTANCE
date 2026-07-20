import { PORT } from './config.js'; // MUST BE FIRST so dotenv loads!
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import routes from './routes/index.js';
import { connectDB } from './db.js';
import { bootstrapDatasetIngestion } from './services/datasetBootstrap.js';

async function start(){
  await connectDB();
  
  // Start ingestion in the background, do not block server startup
  bootstrapDatasetIngestion().catch(console.error);

  const app = express();
  app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));

  app.use('/api', routes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // error handler
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});
