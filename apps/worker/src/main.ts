import { pino } from 'pino';
import {
  readBackendConfig, connectDatabase, createAssetModel, createInspectionModel,
  LocalImageStorage, MockInferenceProvider, startInspectionWorker,
} from '@vip/backend';

const logger = pino({ name: 'inspection-worker' });

async function main() {
  const config = readBackendConfig(process.env);
  const connection = await connectDatabase(config.mongodbUri);
  connection.on('error', () => { logger.error('MongoDB connection error'); });
  const assets = createAssetModel(connection);
  const inspections = createInspectionModel(connection);
  try { await Promise.all([assets.createIndexes(), inspections.createIndexes()]); }
  catch (error) { await connection.close(); throw error; }

  const consumer = startInspectionWorker(config.redisUrl, {
    inspections, assets, storage: new LocalImageStorage(config.storageDirectory),
    provider: new MockInferenceProvider(), logger,
  });
  let closing = false;
  async function shutdown(signal: string) {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Worker shutting down');
    try { await consumer.close(); }
    catch { logger.error('Worker shutdown failed'); process.exitCode = 1; }
    finally { await connection.close(); }
  }
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  try { await consumer.worker.waitUntilReady(); }
  catch (error) { await shutdown('startup-failure'); throw error; }
  if (!closing) logger.info('Inspection worker ready; inference is simulated');
}

main().catch(() => { logger.error('Worker startup failed; check dependency configuration'); process.exitCode = 1; });
