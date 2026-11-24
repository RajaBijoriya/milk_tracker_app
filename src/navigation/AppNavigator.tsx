import React, {useEffect} from 'react';
import {AppState, StyleSheet, View} from 'react-native';
import {NavigationContainer, LinkingOptions} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons/static';
import {Button, Text} from 'react-native-paper';
import MilkLiquidLoader from '../components/MilkLiquidLoader';
import {useAuthStore} from '../store/authStore';
import {useMilkStore} from '../store/milkStore';
import {colors} from '../theme/colors';
import DashboardScreen from '../screens/DashboardScreen';
import CalendarScreen from '../screens/CalendarScreen';
import EntryScreen from '../screens/EntryScreen';
import StatementScreen from '../screens/StatementScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: {token?: string} | undefined;
  Tabs: undefined;
  Entry: {date: string; readOnly?: boolean};
  Setup: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const tabIcons = {
  Home: 'home',
  Calendar: 'calendar-month',
  Statements: 'file-document-outline',
  Settings: 'cog-outline',
} as const;

function renderTabIcon(routeName: keyof typeof tabIcons, color: string, size: number) {
  return <MaterialDesignIcons name={tabIcons[routeName]} size={size} color={color}/>;
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarIcon: ({color, size}) => renderTabIcon(route.name as keyof typeof tabIcons, color, size),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarActiveBackgroundColor: colors.surface,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
        },
      })}>
      <Tab.Screen name="Home" component={DashboardScreen}/>
      <Tab.Screen name="Calendar" component={CalendarScreen}/>
      <Tab.Screen name="Statements" component={StatementScreen}/>
      <Tab.Screen name="Settings" component={SettingsScreen}/>
    </Tab.Navigator>
  );
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['milktracker://'],
  config: {
    screens: {
      ForgotPassword: {
        path: 'reset-password',
        parse: {token: (token: string) => token},
      },
    },
  },
};

function StartupFailure({message, onRetry}: {message: string; onRetry: () => void}) {
  return (
    <View style={styles.failure}>
      <Text variant="titleLarge" style={styles.failureTitle}>Unable to load MilkTracker</Text>
      <Text style={styles.failureMessage}>{message}</Text>
      <Button mode="contained" onPress={onRetry}>Retry</Button>
    </View>
  );
}

export default function AppNavigator() {
  const authUser = useAuthStore(state => state.user);
  const authInitialized = useAuthStore(state => state.initialized);
  const restore = useAuthStore(state => state.restore);
  const signOut = useAuthStore(state => state.signOut);
  const signInError = useAuthStore(state => state.error);

  const milkUserId = useMilkStore(state => state.ownerUserId);
  const milkInitialized = useMilkStore(state => state.initialized);
  const milkLoading = useMilkStore(state => state.loading);
  const profile = useMilkStore(state => state.profile);
  const milkError = useMilkStore(state => state.error);
  const loadMilk = useMilkStore(state => state.load);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (authUser) void loadMilk(authUser.id, authUser.timezone);
  }, [authUser?.id, authUser?.timezone, loadMilk]);

  useEffect(() => {
    if (!authUser) return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', nextState => {
      if (previousState !== 'active' && nextState === 'active') {
        void loadMilk(authUser.id, authUser.timezone);
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [authUser?.id, authUser?.timezone, loadMilk]);

  if (!authInitialized) {
    return <MilkLiquidLoader fullScreen/>;
  }

  const mustLoadMilk = Boolean(authUser && (!milkInitialized || milkUserId !== authUser.id));
  if (mustLoadMilk && milkLoading) {
    return <MilkLiquidLoader fullScreen/>;
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {backgroundColor: colors.white},
          headerTintColor: colors.text,
          headerTitleStyle: {color: colors.text},
          contentStyle: {backgroundColor: colors.background},
        }}>
        {!authUser ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}}/>
            <Stack.Screen name="Register" component={RegisterScreen} options={{title: 'Create account'}}/>
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{title: 'Password reset'}}/>
          </>
        ) : milkError && !profile ? (
          <Stack.Screen
            name="Setup"
            options={{headerShown: false}}
            children={() => (
              <StartupFailure
                message={milkError}
                onRetry={() => void loadMilk(authUser.id, authUser.timezone)}
              />
            )}
          />
        ) : !profile ? (
          <Stack.Screen name="Setup" component={SettingsScreen} options={{title: 'Initial Milk Setup'}}/>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{headerShown: false}}/>
            <Stack.Screen name="Entry" component={EntryScreen} options={{title: 'Milk Entry'}}/>
          </>
        )}
      </Stack.Navigator>
      {signInError && authUser ? (
        <View accessibilityLiveRegion="polite" style={styles.authNotice}>
          <Text style={styles.authNoticeText}>{signInError}</Text>
          <Button compact onPress={() => void signOut()}>Sign out</Button>
        </View>
      ) : null}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  failure: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background},
  failureTitle: {color: colors.text, marginBottom: 8},
  failureMessage: {color: colors.textSecondary, marginBottom: 16},
  authNotice: {position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: colors.surface, padding: 8},
  authNoticeText: {color: colors.text},
});
