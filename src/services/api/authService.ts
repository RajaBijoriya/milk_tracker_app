import {Platform} from 'react-native';
import {apiRequest} from './apiClient';
import {getDeviceIdentity, saveStoredSession, setAccessToken} from './authSession';

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  timezone: string;
};

type TokenResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

async function acceptSession(session: TokenResponse): Promise<AuthUser> {
  await saveStoredSession(session.refreshToken, session.user);
  setAccessToken(session.accessToken);
  return session.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const device = await getDeviceIdentity();
  const result = await apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    authenticated: false,
    body: {email: email.trim().toLowerCase(), password, ...device},
  });
  return acceptSession(result);
}

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const device = await getDeviceIdentity();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const result = await apiRequest<TokenResponse>('/auth/register', {
    method: 'POST',
    authenticated: false,
    body: {
      ...input,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      timezone,
      ...device,
    },
  });
  return acceptSession(result);
}

export async function getCurrentUser(): Promise<AuthUser> {
  const result = await apiRequest<{user: AuthUser}>('/auth/me');
  return result.user;
}

export async function logout(): Promise<void> {
  await apiRequest<{loggedOut: boolean}>('/auth/logout', {method: 'POST'});
}

export async function logoutAll(): Promise<void> {
  await apiRequest<{loggedOut: boolean}>('/auth/logout-all', {method: 'POST'});
}

export async function sendPasswordReset(email: string): Promise<void> {
  await apiRequest<{message: string}>('/auth/forgot-password', {
    method: 'POST',
    authenticated: false,
    body: {email: email.trim().toLowerCase()},
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiRequest<{passwordReset: boolean}>('/auth/reset-password', {
    method: 'POST',
    authenticated: false,
    body: {token, password},
  });
}

export async function getDeviceSessions() {
  const result = await apiRequest<{sessions: Array<{
    _id: string;
    deviceName: string;
    deviceId: string;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
  }>}>('/auth/sessions');
  return result.sessions;
}

export async function revokeDeviceSession(sessionId: string): Promise<void> {
  await apiRequest<{revoked: boolean}>(`/auth/sessions/${encodeURIComponent(sessionId)}`, {method: 'DELETE'});
}

export const devicePlatform = Platform.OS;
