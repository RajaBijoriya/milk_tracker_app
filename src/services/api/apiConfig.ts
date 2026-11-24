import Config from 'react-native-config';

const developmentApiUrl = 'http://10.0.2.2:4000/api/v1';

export function getApiBaseUrl(): string {
  const configured = Config.API_BASE_URL?.trim();
  const baseUrl = configured || (__DEV__ ? developmentApiUrl : '');
  if (!baseUrl) {
    throw new Error('Set API_BASE_URL for this production build before using MilkTracker.');
  }
  if (!__DEV__ && !baseUrl.startsWith('https://')) {
    throw new Error('Production API_BASE_URL must use HTTPS.');
  }
  return baseUrl.replace(/\/+$/, '');
}
