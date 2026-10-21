import mongoose, { type Connection, type InferSchemaType, type Types } from 'mongoose';
import { isInferenceResult, isPersistedReview } from '@vip/contracts';

const configuration = new mongoose.Schema({
  providerId: { type: String, required: true, enum: ['mock'] },
  modelId: { type: String, required: true, enum: ['mock-detector'] },
  modelVersion: { type: String, required: true, enum: ['1.0.0'] },
}, { _id: false });

const failure = new mongoose.Schema({
  code: { type: String, required: true }, message: { type: String, required: true },
}, { _id: false });

const receipt = new mongoose.Schema({
  operationId: { type: String, required: true }, fingerprint: { type: String, required: true },
  revision: { type: Number, required: true }, writeSequence: { type: Number, required: true },
}, { _id: false });
const reviewControl = new mongoose.Schema({
  sequence: { type: Number, required: true, min: 0 },
  operations: { type: [receipt], default: undefined },
}, { _id: false });

const schema = new mongoose.Schema({
  assetId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], required: true, default: 'queued' },
  createdAt: { type: Date, required: true, default: Date.now, immutable: true },
  updatedAt: { type: Date, required: true, default: Date.now },
  processingStartedAt: Date,
  completedAt: Date,
  requested: { type: configuration, required: true, immutable: true },
  attemptCount: { type: Number, required: true, default: 0, min: 0, max: 3 },
  maxAttempts: { type: Number, required: true, default: 3, min: 1, max: 3, immutable: true },
  dispatchGeneration: { type: Number, required: true, default: 0, min: 0 },
  nextAttemptAt: { type: Date, required: true, default: Date.now },
  attemptId: String,
  leaseExpiresAt: Date,
  requestScope: { type: String, required: true, immutable: true },
  requestKey: { type: String, required: true, immutable: true },
  requestFingerprint: { type: String, required: true, immutable: true },
  requestId: { type: String, required: true, immutable: true },
  retriedFrom: { type: mongoose.Schema.Types.ObjectId, immutable: true },
  failure,
  result: { type: mongoose.Schema.Types.Mixed, validate: isInferenceResult },
  processingDurationMs: Number,
  review: { type: mongoose.Schema.Types.Mixed, validate: isPersistedReview },
  reviewControl,
}, { collection: 'inspections', versionKey: false, bufferCommands: false, autoIndex: false });

schema.index({ requestScope: 1, requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } } });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ status: 1, updatedAt: 1 });

export function createInspectionModel(connection: Connection) {
  return connection.model('Inspection', schema);
}
export type InspectionModel = ReturnType<typeof createInspectionModel>;
export type InspectionRecord = InferSchemaType<typeof schema> & { _id: Types.ObjectId };
