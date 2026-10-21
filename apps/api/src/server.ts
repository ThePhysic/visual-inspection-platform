import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { connectDatabase, createAssetModel } from './database.js';
import { LocalImageStorage } from './storage.js';
import sharp from 'sharp';
import { createInspectionModel, InspectionQueue, InspectionReconciler } from '@vip/backend';

async function main() {
  const config = readConfig(process.env);
  sharp.cache({ memory: 32, files: 0, items: 32 });
  sharp.concurrency(2);
  const storage = new LocalImageStorage(config.storageDirectory);
  await storage.initialize();
  const connection = await connectDatabase(config.mongodbUri);
  const model = createAssetModel(connection);
  const inspections = createInspectionModel(connection);
  try {
    await model.createIndexes();
    await inspections.createIndexes();
  } catch (error) {
    await connection.close();
    throw error;
  }
  const redisStatus: Pick<InspectionQueue, 'healthy'> = { healthy: () => queue.healthy() };
  const app = buildApp({ logger: true, assets: { model, storage }, inspections: { inspections, assets: model }, dispatchQueue: redisStatus });
  const queue = new InspectionQueue(config.redisUrl, app.log);
  const reconciler = new InspectionReconciler(inspections, queue, app.log);
  app.addHook('onClose', async () => {
    try { await reconciler.close(); } finally {
      try { await queue.close(); } finally { await connection.close(); }
    }
  });
  connection.on('error', () => { app.log.error('MongoDB connection error'); });

  async function shutdown(signal: string) {
    app.log.info({ signal }, 'Shutting down API');
    try {
      await app.close();
    } catch (error) {
      app.log.error({ err: error }, 'API shutdown failed');
      process.exitCode = 1;
    }
  }

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

  try {
    await app.listen({ host: config.host, port: config.port });
    reconciler.start();
  } catch (error) {
    await app.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error('API startup failed. Check database, storage, and listen configuration.',
    error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
});
