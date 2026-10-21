import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { connectDatabase, createInspectionModel, InspectionQueue, jobId } from '@vip/backend';
import { databaseName, mongodbUri, redisUrl, storageDirectory, workspaceRoot } from './settings';

export default async function cleanup() {
  const connection = await connectDatabase(mongodbUri);
  const queue = new InspectionQueue(redisUrl, { info() {}, warn() {}, error() {} });
  try {
    const records = await createInspectionModel(connection).find().lean().exec();
    for (const record of records) {
      for (let generation = 0; generation <= record.dispatchGeneration; generation++) {
        const job = await queue.queue.getJob(jobId({ payloadVersion: 'v1', inspectionId: record._id.toString(), generation }));
        // Never remove another run's jobs or flush the shared Redis instance.
        if (job) await job.remove().catch(() => { console.warn('An active browser-test job remains subject to normal queue retention.'); });
      }
    }
    if (connection.name !== databaseName || !/^vip_browser_test_[a-f0-9]{32}$/.test(databaseName)) throw new Error('Refusing unsafe test database cleanup.');
    await connection.dropDatabase();
  } finally { await queue.close(); await connection.close(); }
  const parent = resolve(workspaceRoot, '.data/browser-tests');
  if (!storageDirectory.startsWith(`${parent}${sep}`) || !/^[a-f0-9]{32}$/.test(storageDirectory.slice(parent.length + 1))) throw new Error('Refusing unsafe test image cleanup.');
  await rm(storageDirectory, { recursive: true, force: true });
}
