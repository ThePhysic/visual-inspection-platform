export function classColor(classId: string) {
  const colors = ['#1264a3', '#9b3a05', '#6e398f', '#19704c'];
  if (classId === 'surface-mark') return colors[0]!;
  if (classId === 'edge-defect') return colors[1]!;
  const hash = Array.from(classId).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return colors[hash % colors.length]!;
}
export function confidenceLabel(confidence: number) { return `${(confidence * 100).toFixed(1)}%`; }
