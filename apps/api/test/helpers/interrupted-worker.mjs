// Test-only child process, absent from runtime images. There is no deployed
// fault switch or API endpoint. The parent owns this process and its IPC pipe.
import { resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  connectDatabase, createAssetModel, createInspectionModel, LocalImageStorage,
  MockInferenceProvider, startInspectionWorker, EXECUTION_POLICY,
} from '@vip/backend';

const config = JSON.parse(process.env.VIP_INTERRUPTION_TEST);
if (!process.send || !/^vip_inspection_test_[a-f0-9]+$/.test(config.database)
  || !config.queue.startsWith('inspections-test-')
  || !resolve(config.directory).startsWith(`${resolve(tmpdir())}${sep}vip-pipeline-test-`)
  || !['before-inference', 'after-inference', 'after-persistence'].includes(config.phase)) {
  throw new Error('Refusing non-isolated interruption fixture');
}
const connection = await connectDatabase(config.mongodbUri, config.database);
const inspections = createInspectionModel(connection);
const assets = createAssetModel(connection);
async function barrier() {
  process.send({ phase: config.phase });
  await new Promise(() => {}); // Parent terminates only this owned child.
}
const provider = new MockInferenceProvider();
const update = inspections.collection.updateOne.bind(inspections.collection);
inspections.collection.updateOne = async (...args) => {
  const completing = !Array.isArray(args[1]) && args[1].$set?.status === 'completed';
  if (completing && config.phase === 'after-inference') await barrier();
  const result = await update(...args);
  if (completing && config.phase === 'after-persistence') await barrier();
  return result;
};
const consumer = startInspectionWorker(config.redisUrl, {
  inspections, assets, storage: new LocalImageStorage(config.directory),
  provider: { async infer(image, signal) {
    if (config.phase === 'before-inference') await barrier();
    return provider.infer(image, signal);
  } },
  logger: { info() {}, warn() {}, error() {} },
  policy: { ...EXECUTION_POLICY, leaseMs: 2000, attemptTimeoutMs: 1000 },
}, config.queue);
await consumer.worker.waitUntilReady();
