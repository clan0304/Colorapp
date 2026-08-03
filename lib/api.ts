import Constants from 'expo-constants';

/**
 * Resolve an API route URL. In development the Expo dev server hosts the API
 * routes, so native builds must target the dev machine's host. In production
 * this becomes the deployed origin (EAS Hosting), configurable via env.
 */
export function apiUrl(path: string): string {
  const origin =
    process.env.EXPO_PUBLIC_API_ORIGIN ??
    (Constants.expoConfig?.hostUri ? `http://${Constants.expoConfig.hostUri}` : '');
  return `${origin}${path}`;
}

export type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details?: { field: string; message: string }[];
};

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.requestId = body.requestId;
  }
}

export async function postJson<T>(
  path: string,
  body: unknown,
  options?: { token?: string | null },
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    if (json && typeof json.code === 'string' && typeof json.message === 'string') {
      throw new ApiError(json as ApiErrorBody);
    }
    throw new Error(`Request failed (${response.status})`);
  }
  return json as T;
}
