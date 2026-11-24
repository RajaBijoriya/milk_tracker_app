import {clearStoredSession, getAccessToken, getStoredSession, saveStoredSession, setAccessToken} from './authSession';
import {getApiBaseUrl} from './apiConfig';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {code: string; message: string; details?: unknown};
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshing: Promise<boolean> | null = null;

async function decode<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an invalid response.');
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const stored = await getStoredSession();
    if (!stored) return false;
    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refreshToken: stored.refreshToken}),
    });
    const envelope = await decode<{
      accessToken: string;
      refreshToken: string;
      user: {id: string; fullName: string; email: string; timezone: string};
    }>(response);
    if (response.status === 401) {
      await clearStoredSession();
      return false;
    }
    if (!response.ok || !envelope.success || !envelope.data) {
      throw new ApiError(
        response.status,
        envelope.error?.code ?? 'REFRESH_FAILED',
        envelope.error?.message ?? 'Unable to refresh the sign-in session.',
        envelope.error?.details,
      );
    }
    await saveStoredSession(envelope.data.refreshToken, envelope.data.user);
    setAccessToken(envelope.data.accessToken);
    return true;
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {method?: string; body?: unknown; authenticated?: boolean} = {},
): Promise<T> {
  const authenticated = options.authenticated ?? true;
  if (authenticated && !getAccessToken() && !(await refreshAccessToken())) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
  }

  const execute = async (): Promise<Response> => {
    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    const token = getAccessToken();
    if (authenticated && token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : {body: JSON.stringify(options.body)}),
    });
  };

  let response = await execute();
  if (authenticated && response.status === 401 && await refreshAccessToken()) {
    response = await execute();
  }
  const envelope = await decode<T>(response);
  if (!response.ok || !envelope.success || envelope.data === undefined) {
    throw new ApiError(
      response.status,
      envelope.error?.code ?? 'REQUEST_FAILED',
      envelope.error?.message ?? 'The request could not be completed.',
      envelope.error?.details,
    );
  }
  return envelope.data;
}

export async function restoreAccessToken(): Promise<boolean> {
  return refreshAccessToken();
}
