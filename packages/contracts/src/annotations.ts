import { Type } from 'typebox';

export const MAX_DETECTIONS = 200;
export const MOCK_LABELS = [
  { classId: 'surface-mark', label: 'Surface mark' },
  { classId: 'edge-defect', label: 'Edge defect' },
] as const;
export const BoundingBoxSchema = Type.Object({
  x: Type.Number({ minimum: 0, maximum: 1 }),
  y: Type.Number({ minimum: 0, maximum: 1 }),
  width: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
  height: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
}, { additionalProperties: false });
