/**
 * Reads a fetch Response body as text while bounding memory use on malicious huge payloads.
 */
export async function readResponseBodyLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    return res.text();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      const nextTotal = total + value.length;
      if (nextTotal > maxBytes) {
        const allowed = value.length - (nextTotal - maxBytes);
        if (allowed > 0) {
          chunks.push(value.subarray(0, allowed));
        }
        break;
      }
      chunks.push(value);
      total = nextTotal;
    }
  } finally {
    reader.releaseLock?.();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
