import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Button, Card, Text, TextInput} from 'react-native-paper';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../navigation/AppNavigator';
import FormScrollView from '../../components/FormScrollView';
import MilkLiquidLoader from '../../components/MilkLiquidLoader';
import {useAuthStore} from '../../store/authStore';
import {colors} from '../../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({navigation}: Props) {
  const signIn = useAuthStore(state => state.signIn);
  const loading = useAuthStore(state => state.loading);
  const storeError = useAuthStore(state => state.error);
  const clearError = useAuthStore(state => state.clearError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    clearError();
    if (!email.trim() || !password) {
      setLocalError('Enter your email and password.');
      return;
    }
    try {
      await signIn(email, password);
    } catch {
      // The authentication store exposes the service error to this screen.
    }
  };

  return (
    <FormScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.heading}>
        <Text variant="headlineMedium" style={styles.title}>MilkTracker</Text>
        <Text style={styles.subtitle}>Sign in to sync your milk records.</Text>
      </View>
      <Card mode="elevated" style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.cardTitle}>Welcome back</Text>
          <TextInput
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            style={styles.field}
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            right={<TextInput.Icon icon={showPassword ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShowPassword(value => !value)}/>}
            mode="outlined"
            style={styles.field}
          />
          {localError || storeError ? <Text style={styles.error}>{localError ?? storeError}</Text> : null}
          {loading ? <MilkLiquidLoader size={56} showText={false}/> : null}
          <Button mode="contained" onPress={submit} disabled={loading} style={styles.button}>Sign in</Button>
          <Button onPress={() => navigation.navigate('ForgotPassword')}>Forgot password?</Button>
          <Button onPress={() => navigation.navigate('Register')}>Create an account</Button>
        </Card.Content>
      </Card>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  container: {flexGrow: 1, justifyContent: 'center', padding: 20},
  heading: {alignItems: 'center', marginBottom: 24},
  title: {color: colors.primary, fontWeight: '700'},
  subtitle: {color: colors.textSecondary, marginTop: 6},
  card: {borderRadius: 18, backgroundColor: colors.surface},
  cardTitle: {color: colors.text, marginBottom: 8},
  field: {marginTop: 12, backgroundColor: colors.white},
  error: {color: colors.error, marginTop: 12},
  button: {marginTop: 16},
});
