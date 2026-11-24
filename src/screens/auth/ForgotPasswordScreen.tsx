import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import {Button, Card, Text, TextInput} from 'react-native-paper';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../navigation/AppNavigator';
import FormScrollView from '../../components/FormScrollView';
import MilkLiquidLoader from '../../components/MilkLiquidLoader';
import {sendPasswordReset, resetPassword} from '../../services/api/authService';
import {useAuthStore} from '../../store/authStore';
import {colors} from '../../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({navigation, route}: Props) {
  const loading = useAuthStore(state => state.loading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = route.params?.token;

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!token && !email.trim()) {
      setError('Enter your account email address.');
      return;
    }
    if (token && password.length < 12) {
      setError('Use a password with at least 12 characters.');
      return;
    }
    if (token && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (token) {
        await resetPassword(token, password);
        setMessage('Password updated. You can now sign in on your devices.');
      } else {
        await sendPasswordReset(email);
        setMessage('If the account exists, password reset instructions have been sent.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to process the password reset.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card mode="elevated" style={styles.card}>
        <Card.Content>
          <Text variant="headlineSmall" style={styles.title}>{token ? 'Choose a new password' : 'Reset your password'}</Text>
          {token ? (
            <>
              <TextInput label="New password (at least 12 characters)" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={styles.field}/>
              <TextInput label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry mode="outlined" style={styles.field}/>
            </>
          ) : (
            <TextInput label="Account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" mode="outlined" style={styles.field}/>
          )}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {(busy || loading) ? <MilkLiquidLoader size={56} showText={false}/> : null}
          <Button mode="contained" onPress={submit} disabled={busy || loading} style={styles.button}>
            {token ? 'Update password' : 'Send reset link'}
          </Button>
          <Button onPress={() => navigation.navigate('Login')}>Back to sign in</Button>
        </Card.Content>
      </Card>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  container: {flexGrow: 1, justifyContent: 'center', padding: 20},
  card: {borderRadius: 18, backgroundColor: colors.surface},
  title: {color: colors.text},
  field: {marginTop: 12, backgroundColor: colors.white},
  message: {color: colors.success, marginTop: 12},
  error: {color: colors.error, marginTop: 12},
  button: {marginTop: 16},
});
