import React from 'react';
import {Platform, ScrollView, StyleSheet} from 'react-native';
import {act, create} from 'react-test-renderer';
import {Button, Card, PaperProvider} from 'react-native-paper';
import SettingsScreen from '../src/screens/SettingsScreen';

jest.mock('../src/store/milkStore', () => {
  const store = jest.fn((selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      profile: {
        id: 1,
        cloudId: 'profile-1',
        name: 'Daily Milk',
        defaultQuantityMl: 1000,
        pricePerLitrePaise: 7000,
        startDate: '2026-11-24',
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
      createProfile: jest.fn(),
      updateProfile: jest.fn(),
      loading: false,
      error: null,
    };
    return selector ? selector(state) : state;
  });
  Object.assign(store, {getState: () => ({load: jest.fn()})});
  return {useMilkStore: store};
});

jest.mock('../src/store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    user: {id: 'user-1', fullName: 'Test User', email: 'user@example.com', timezone: 'Asia/Kolkata'},
    signOut: jest.fn(),
    signOutAll: jest.fn(),
  }),
}));

jest.mock('../src/services/api/authService', () => ({
  getDeviceSessions: jest.fn().mockResolvedValue([]),
  revokeDeviceSession: jest.fn(),
}));

jest.mock('../src/services/api/syncService', () => ({
  getLegacyImportData: jest.fn().mockResolvedValue(null),
  legacyImportOwner: jest.fn(),
  previewImport: jest.fn(),
  importLegacyData: jest.fn(),
}));

jest.mock('../src/components/StartDatePicker', () => () => null);

test('keeps Settings and Account cards spaced inside a scrollable padded container', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <PaperProvider settings={{icon: () => null}}>
        <SettingsScreen/>
      </PaperProvider>,
    );
  });

  const scroll = tree!.root.findByType(ScrollView);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 32,
  });
  expect(scroll.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');

  const mainCards = tree!.root.findAllByType(Card).filter(card => card.props.mode === 'elevated');
  expect(mainCards.length).toBeGreaterThanOrEqual(2);
  expect(mainCards[0].props.style).toMatchObject({marginBottom: 16});
  expect(mainCards[1].props.style).toMatchObject({marginBottom: 16});

  const signOutButton = tree!.root.findAllByType(Button).find(button => button.props.children === 'Sign out');
  expect(signOutButton).toBeDefined();
  act(() => tree!.unmount());
});
