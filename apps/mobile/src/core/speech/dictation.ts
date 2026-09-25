export function appendRecognizedText(current: string, transcript: string) {
  const existing = current.trim();
  const recognized = transcript.trim();
  if (!existing) return recognized;
  if (!recognized) return existing;
  return `${existing} ${recognized}`;
}
