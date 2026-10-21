import mongoose, { type Connection, type InferSchemaType } from 'mongoose';
import { databaseFailure } from './errors.js';

const assetSchema = new mongoose.Schema({
  storageKey: { type: String, required: true, immutable: true },
  mimeType: { type: String, enum: ['image/jpeg', 'image/png'], required: true, immutable: true },
  width: { type: Number, min: 1, required: true, immutable: true },
  height: { type: Number, min: 1, required: true, immutable: true },
  byteLength: { type: Number, min: 1, required: true, immutable: true },
  sha256: { type: String, match: /^[a-f0-9]{64}$/, required: true, immutable: true },
  source: { type: String, enum: ['browser', 'api'], required: true, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true, required: true },
}, { collection: 'assets', versionKey: false, bufferCommands: false, autoIndex: false });

assetSchema.index({ storageKey: 1 }, { unique: true });

export type AssetRecord = InferSchemaType<typeof assetSchema>;
export function createAssetModel(connection: Connection) {
  return connection.model('Asset', assetSchema);
}

export type AssetModel = ReturnType<typeof createAssetModel>;

export async function connectDatabase(uri: string, dbName?: string) {
  const connection = mongoose.createConnection();
  try {
    await connection.openUri(uri, {
      ...(dbName ? { dbName } : {}),
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 5000,
      bufferCommands: false,
      autoIndex: false,
    });
    return connection;
  } catch (cause) {
    await connection.close().catch(() => {});
    throw databaseFailure(cause);
  }
}

export async function checkDatabase(connection: Connection) {
  if (connection.readyState !== 1 || !connection.db) throw databaseFailure();
  try {
    await connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
  } catch (cause) {
    throw databaseFailure(cause);
  }
}
