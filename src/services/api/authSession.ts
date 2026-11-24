import * as Keychain from 'react-native-keychain';

const AUTH_SERVICE = 'com.milktracker.auth.refresh';
const DEVICE_SERVICE = 'com.milktracker.device.identity';

export type CachedUser = {
  id: string;
  fullName: string;
  email: string;
  timezone: string;
};

export type StoredSession = {
  refreshToken: string;
  cachedUser: CachedUser | null;
};

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function saveStoredSession(refreshToken: string, user: CachedUser): Promise<void> {
  const result = await Keychain.setGenericPassword(
    JSON.stringify(user),
    refreshToken,
    {service: AUTH_SERVICE},
  );
  if (!result) throw new Error('Secure storage could not save the sign-in session.');
}

export async function getStoredSession(): Promise<StoredSession | null> {
  const credentials = await Keychain.getGenericPassword({service: AUTH_SERVICE});
  if (!credentials) return null;
  let cachedUser: CachedUser | null = null;
  try {
    const parsed: unknown = JSON.parse(credentials.username);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      'fullName' in parsed &&
      'email' in parsed &&
      'timezone' in parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.fullName === 'string' &&
      typeof parsed.email === 'string' &&
      typeof parsed.timezone === 'string'
    ) {
      cachedUser = {
        id: parsed.id,
        fullName: parsed.fullName,
        email: parsed.email,
        timezone: parsed.timezone,
      };
    }
  } catch {
    cachedUser = null;
  }
  return {refreshToken: credentials.password, cachedUser};
}

export async function clearStoredSession(): Promise<void> {
  const removed = await Keychain.resetGenericPassword({service: AUTH_SERVICE});
  setAccessToken(null);
  if (!removed) {
    const remaining = await Keychain.getGenericPassword({service: AUTH_SERVICE});
    if (remaining) throw new Error('Secure storage could not remove the sign-in session.');
  }
}

export async function getDeviceIdentity(): Promise<{deviceName: string; deviceId: string}> {
  let credentials = await Keychain.getGenericPassword({service: DEVICE_SERVICE});
  if (!credentials) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const stored = await Keychain.setGenericPassword('device', id, {service: DEVICE_SERVICE});
    if (!stored) throw new Error('Secure storage could not initialize this device identity.');
    credentials = await Keychain.getGenericPassword({service: DEVICE_SERVICE});
  }
  if (!credentials) throw new Error('Secure storage could not read this device identity.');
  return {
    deviceId: credentials.password,
    deviceName: `MilkTracker ${credentials.username}`,
  };
}
