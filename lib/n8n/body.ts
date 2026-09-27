import "server-only";

// Reads the request body as text but stops as soon as it grows past maxBytes (null): a Route Handler
// has no body limit of its own, and content-length can be missing (chunked) or wrong.
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks)); // the same text request.text() would give
}
