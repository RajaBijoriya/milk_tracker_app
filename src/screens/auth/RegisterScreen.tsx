import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import {Button, Card, Text, TextInput} from 'react-native-paper';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../navigation/AppNavigator';
import FormScrollView from '../../components/FormScrollView';
import MilkLiquidLoader from '../../components/MilkLiquidLoader';
import {useAuthStore} from '../../store/authStore';
import {colors} from '../../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({navigation}: Props) {
  const signUp = useAuthStore(state => state.signUp);
  const loading = useAuthStore(state => state.loading);
  const storeError = useAuthStore(state => state.error);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    if (!fullName.trim() || !email.trim()) {
      setLocalError('Enter your name and email address.');
      return;
    }
    if (password.length < 12) {
      setLocalError('Use a password with at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('The passwords do not match.');
      return;
    }
    try {
      await signUp({fullName, email, password});
    } catch {
      // The authentication store exposes the service error to this screen.
    }
  };

  return (
    <FormScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card mode="elevated" style={styles.card}>
        <Card.Content>
          <Text variant="headlineSmall" style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Your records will be available on your signed-in devices.</Text>
          <TextInput label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" mode="outlined" style={styles.field}/>
          <TextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" mode="outlined" style={styles.field}/>
          <TextInput
            label="Password (at least 12 characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            right={<TextInput.Icon icon={showPassword ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShowPassword(value => !value)}/>}
            mode="outlined"
            style={styles.field}
          />
          <TextInput label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} mode="outlined" style={styles.field}/>
          {localError || storeError ? <Text style={styles.error}>{localError ?? storeError}</Text> : null}
          {loading ? <MilkLiquidLoader size={56} showText={false}/> : null}
          <Button mode="contained" onPress={submit} disabled={loading} style={styles.button}>Create account</Button>
          <Button onPress={() => navigation.navigate('Login')}>Already have an account? Sign in</Button>
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
  subtitle: {color: colors.textSecondary, marginTop: 6},
  field: {marginTop: 12, backgroundColor: colors.white},
  error: {color: colors.error, marginTop: 12},
  button: {marginTop: 16},
});
