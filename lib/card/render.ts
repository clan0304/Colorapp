const API_BASE = 'https://api.creatomate.com/v2';

type RenderStatus = {
  id: string;
  status: string;
  url?: string;
  error_message?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function getCreatomateApiKey(): string {
  const key = process.env.CREATOMATE_API_KEY;
  if (!key) {
    throw new Error('CREATOMATE_API_KEY is not set. Add it to .env (see .env.example).');
  }
  return key;
}

/**
 * Submit an inline RenderScript source to Creatomate and wait until the
 * render succeeds. Returns the CDN URL of the finished image.
 */
export async function renderToUrl(
  source: Record<string, unknown>,
  apiKey: string,
  timeoutMs = 150_000,
): Promise<string> {
  const response = await fetch(`${API_BASE}/renders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(source),
  });
  if (!response.ok) {
    throw new Error(`Creatomate render request failed (${response.status}): ${await response.text()}`);
  }
  const created = (await response.json()) as RenderStatus | RenderStatus[];
  const render = Array.isArray(created) ? created[0] : created;
  if (!render?.id) {
    throw new Error(`Unexpected Creatomate response: ${JSON.stringify(created)}`);
  }

  const deadline = Date.now() + timeoutMs;
  let status: RenderStatus = render;
  while (status.status !== 'succeeded') {
    if (status.status === 'failed') {
      throw new Error(`Creatomate render failed: ${status.error_message ?? 'unknown error'}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Creatomate render timed out after ${timeoutMs / 1000}s (last status: ${status.status})`);
    }
    await sleep(2000);
    const poll = await fetch(`${API_BASE}/renders/${render.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!poll.ok) {
      throw new Error(`Creatomate status poll failed (${poll.status}): ${await poll.text()}`);
    }
    status = (await poll.json()) as RenderStatus;
  }

  if (!status.url) throw new Error('Render succeeded but no URL was returned.');
  return status.url;
}

/**
 * Render and download the finished image. Used by the CLI scripts, which save
 * the file locally; the API route only needs the URL via renderToUrl.
 */
export async function renderImage(
  source: Record<string, unknown>,
  apiKey: string,
  timeoutMs = 150_000,
): Promise<{ buffer: Buffer; url: string }> {
  const url = await renderToUrl(source, apiKey, timeoutMs);
  const file = await fetch(url);
  if (!file.ok) throw new Error(`Failed to download rendered image (${file.status})`);
  return { buffer: Buffer.from(await file.arrayBuffer()), url };
}
