import React, {useEffect, useState} from 'react';
import {StyleSheet, Alert, View} from 'react-native';
import {Button, Card, Text, TextInput} from 'react-native-paper';
import FormScrollView from '../components/FormScrollView';
import {useMilkStore} from '../store/milkStore';
import {useAuthStore} from '../store/authStore';
import {DEFAULT_PROFILE_NAME} from '../constants/appConstants';
import {todayKey} from '../utils/dateUtils';
import {colors} from '../theme/colors';
import MilkLiquidLoader from '../components/MilkLiquidLoader';
import * as authService from '../services/api/authService';
import * as syncService from '../services/api/syncService';
import {LegacyImportData} from '../services/api/milkApiService';
import {dateKeyInTimezone} from '../utils/editWindow';
import StartDatePicker from '../components/StartDatePicker';
import {getStartDateRange, isStartDateAllowed} from '../utils/startDateRange';

export default function SettingsScreen() {
  const {profile, createProfile, updateProfile, loading, error} = useMilkStore();
  const user = useAuthStore(state => state.user);
  const signOut = useAuthStore(state => state.signOut);
  const signOutAll = useAuthStore(state => state.signOutAll);
  const [name, setName] = useState(profile?.name ?? DEFAULT_PROFILE_NAME);
  const [quantity, setQuantity] = useState(profile ? String(profile.defaultQuantityMl / 1000) : '1');
  const [price, setPrice] = useState(profile ? String(profile.pricePerLitrePaise / 100) : '70');
  const [effectiveDate, setEffectiveDate] = useState(
    profile?.startDate ?? (user ? dateKeyInTimezone(new Date(), user.timezone) : todayKey()),
  );
  const [dateError, setDateError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof authService.getDeviceSessions>>>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [legacyData, setLegacyData] = useState<LegacyImportData | null>(null);
  const [importOwner, setImportOwner] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<Awaited<ReturnType<typeof syncService.previewImport>>['preview'] | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setQuantity(String(profile.defaultQuantityMl / 1000));
      setPrice(String(profile.pricePerLitrePaise / 100));
      setEffectiveDate(profile.startDate);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    if (!profile) setEffectiveDate(dateKeyInTimezone(new Date(), user.timezone));
    let active = true;
    void Promise.all([
      authService.getDeviceSessions(),
      syncService.getLegacyImportData().then(async data => ({
        data,
        owner: data ? await syncService.legacyImportOwner(data) : null,
      })),
    ]).then(([remoteSessions, localImport]) => {
      if (!active) return;
      setSessions(remoteSessions);
      setLegacyData(localImport.data);
      setImportOwner(localImport.owner);
      setSessionError(null);
    }).catch(loadError => {
      if (active) setSessionError(loadError instanceof Error ? loadError.message : 'Unable to load account information.');
    });
    return () => { active = false; };
  }, [user?.id, user?.timezone, profile?.id]);

  const startDateRange = getStartDateRange(new Date(), user?.timezone ?? 'Asia/Kolkata');

  const save = async () => {
    setDateError(null);
    setSaveMessage(null);
    const quantityMl = Math.round(Number(quantity) * 1000);
    const pricePaise = Math.round(Number(price) * 100);
    if (!name.trim() || !Number.isFinite(quantityMl) || quantityMl < 0 || !Number.isFinite(pricePaise) || pricePaise < 0) {
      Alert.alert('Invalid settings', 'Enter a profile name and valid quantity and price.');
      return;
    }
    const startDateChanged = !profile || effectiveDate !== profile.startDate;
    if (startDateChanged && !isStartDateAllowed(effectiveDate, startDateRange)) {
      setDateError(`Choose a tracking start date from ${startDateRange.min} through ${startDateRange.max}.`);
      return;
    }
    try {
      if (profile) {
        await updateProfile({
          ...profile,
          name: name.trim(),
          defaultQuantityMl: quantityMl,
          pricePerLitrePaise: pricePaise,
          startDate: effectiveDate,
        }, dateKeyInTimezone(new Date(), user?.timezone ?? 'Asia/Kolkata'));
      } else {
        await createProfile({name: name.trim(), defaultQuantityMl: quantityMl, pricePerLitrePaise: pricePaise, startDate: effectiveDate});
      }
      setSaveMessage('Settings saved. Your account data and statements have been refreshed.');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Please try again.';
      if (message.includes('START_DATE_OUT_OF_RANGE') || message.toLowerCase().includes('tracking start date')) {
        setDateError(message);
      } else {
        Alert.alert('Unable to save settings', message);
      }
    }
  };

  const showImportPreview = async () => {
    if (!legacyData) return;
    setAccountBusy(true);
    setImportError(null);
    try {
      const result = await syncService.previewImport(legacyData);
      setImportPreview(result.preview);
    } catch (previewError) {
      setImportError(previewError instanceof Error ? previewError.message : 'Unable to preview local data.');
    } finally {
      setAccountBusy(false);
    }
  };

  const confirmImport = () => {
    if (!legacyData || !user || !importPreview) return;
    Alert.alert(
      'Import local data?',
      `${importPreview.importableCount} entries can be imported. ${importPreview.historicalReadOnlyCount} older entries will be read-only. ${importPreview.duplicateCount} duplicates and ${importPreview.finalizedMonthCount} finalized months will be skipped. This will not delete the data stored on this device.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Import',
          onPress: () => {
            setAccountBusy(true);
            setImportError(null);
            void syncService.importLegacyData(user.id, legacyData).then(async result => {
              const refreshedOwner = await syncService.legacyImportOwner(legacyData);
              setImportOwner(refreshedOwner);
              setImportPreview(null);
              await useMilkStore.getState().load(user.id, user.timezone);
              Alert.alert('Import complete', `${result.importedCount} entries imported. Your existing local records are unchanged.`);
            }).catch(importFailure => {
              setImportError(importFailure instanceof Error ? importFailure.message : 'Unable to import local data.');
            }).finally(() => setAccountBusy(false));
          },
        },
      ],
    );
  };

  const revokeSession = (sessionId: string) => {
    Alert.alert('Revoke session?', 'That device will need to sign in again.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () => {
          void authService.revokeDeviceSession(sessionId).then(async () => {
            setSessions(await authService.getDeviceSessions());
          }).catch(revokeError => {
            setSessionError(revokeError instanceof Error ? revokeError.message : 'Unable to revoke this session.');
          });
        },
      },
    ]);
  };

  const confirmSignOut = (allDevices: boolean) => {
    Alert.alert(
      allDevices ? 'Sign out all devices?' : 'Sign out?',
      allDevices ? 'All active sessions will be revoked.' : 'This device will be signed out.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (allDevices ? signOutAll() : signOut()).catch(signOutError => {
              Alert.alert('Sign-out issue', signOutError instanceof Error ? signOutError.message : 'Unable to confirm sign-out with the server.');
            });
          },
        },
      ],
    );
  };

  return (
    <FormScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator>
      <Card mode="elevated" style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <Text variant="titleLarge" style={styles.heading}>{profile ? 'Milk Settings' : 'Configure Milk'}</Text>
          <TextInput label="Milk profile name" value={name} onChangeText={setName} mode="outlined" style={styles.field}/>
          <TextInput label="Default quantity (litres)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" mode="outlined" style={styles.field}/>
          <TextInput label="Price per litre (₹)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" mode="outlined" style={styles.field}/>
          <StartDatePicker
            value={effectiveDate}
            range={startDateRange}
            onChange={date => {
              setEffectiveDate(date);
              setDateError(null);
              setSaveMessage(null);
            }}
            disabled={loading}
          />
          <Text style={styles.dateRange}>Selectable: {startDateRange.min} through {startDateRange.max} ({user?.timezone ?? 'Asia/Kolkata'})</Text>
          {dateError ? <Text style={styles.error}>{dateError}</Text> : null}
          {saveMessage ? <Text accessibilityLiveRegion="polite" style={styles.success}>{saveMessage}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? <MilkLiquidLoader size={56} showText={false}/> : null}
          <Button
            mode="contained"
            icon="content-save-outline"
            onPress={save}
            disabled={loading}
            style={styles.saveButton}>
            {profile ? 'Save Changes' : 'Start Tracking'}
          </Button>
        </Card.Content>
      </Card>
      {user ? (
        <>
          <Card mode="elevated" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <Text variant="titleLarge" style={styles.heading}>Account</Text>
              <View style={styles.accountDetails}>
                <Text style={styles.accountText}>{user.fullName}</Text>
                <Text style={styles.secondaryText}>{user.email}</Text>
                <Text style={styles.secondaryText}>Timezone: {user.timezone}</Text>
              </View>
              <Text variant="titleMedium" style={styles.subheading}>Active devices</Text>
              {sessions.map(session => (
                <Card key={session._id} mode="outlined" style={styles.session}>
                  <Card.Content>
                    <View style={styles.sessionDetails}>
                      <Text style={styles.accountText}>{session.deviceName}</Text>
                      <Text style={styles.secondaryText}>Last active: {new Date(session.lastUsedAt).toLocaleString()}</Text>
                    </View>
                    <Button compact style={styles.sessionAction} onPress={() => revokeSession(session._id)} disabled={accountBusy}>Revoke session</Button>
                  </Card.Content>
                </Card>
              ))}
              {sessions.length === 0 && !sessionError ? <Text style={styles.secondaryText}>No active sessions found.</Text> : null}
              {sessionError ? <Text style={styles.error}>{sessionError}</Text> : null}
              <Button mode="outlined" onPress={() => confirmSignOut(false)} style={styles.accountAction}>Sign out</Button>
              <Button mode="outlined" textColor={colors.error} onPress={() => confirmSignOut(true)} style={styles.accountAction}>Sign out all devices</Button>
            </Card.Content>
          </Card>
          <Card mode="elevated" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <Text variant="titleLarge" style={styles.heading}>Import this device’s local data</Text>
              <Text style={styles.secondaryText}>
                Import is optional and requires confirmation. Existing local entries will not be deleted. Entries outside the current and previous two months remain read-only.
              </Text>
              {!legacyData ? (
                <Text style={styles.secondaryText}>No local milk profile was found on this device.</Text>
              ) : importOwner === user.id ? (
                <Text style={styles.success}>This local data set was already imported to this account.</Text>
              ) : (
                <Button mode="outlined" onPress={showImportPreview} disabled={accountBusy} style={styles.accountAction}>
                  {accountBusy ? 'Loading…' : 'Preview local data'}
                </Button>
              )}
              {importOwner && importOwner !== user.id ? (
                <Text style={styles.secondaryText}>This device’s data was previously imported to another account. You may preview and import a copy here.</Text>
              ) : null}
              {importPreview ? (
                <>
                  <Text style={styles.previewText}>
                    {importPreview.importableCount} importable · {importPreview.historicalReadOnlyCount} historical read-only · {importPreview.duplicateCount} duplicates · {importPreview.finalizedMonthCount} finalized months skipped
                  </Text>
                  <Button mode="contained" onPress={confirmImport} disabled={accountBusy || importPreview.profileExists} style={styles.accountAction}>
                    Confirm Import
                  </Button>
                  {importPreview.profileExists ? <Text style={styles.error}>This account already has a milk profile; a second profile cannot be imported.</Text> : null}
                </>
              ) : null}
              {importError ? <Text style={styles.error}>{importError}</Text> : null}
            </Card.Content>
          </Card>
        </>
      ) : null}
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  container: {flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, backgroundColor: colors.background},
  card: {borderRadius: 16, backgroundColor: colors.surface, marginBottom: 16},
  cardContent: {padding: 16},
  heading: {color: colors.text, marginBottom: 8},
  subheading: {color: colors.text, marginTop: 16, marginBottom: 8},
  accountDetails: {gap: 6, marginVertical: 8},
  accountText: {color: colors.text, fontWeight: '600'},
  secondaryText: {color: colors.textSecondary},
  session: {marginTop: 10, backgroundColor: colors.white, borderColor: colors.border},
  sessionDetails: {gap: 6},
  sessionAction: {marginTop: 8},
  accountAction: {marginTop: 16},
  previewText: {color: colors.text, marginTop: 12},
  success: {color: colors.success, marginTop: 8},
  field: {marginTop: 12, backgroundColor: colors.white},
  dateRange: {color: colors.textSecondary, marginTop: 8},
  saveButton: {marginTop: 16, marginBottom: 16},
  error: {color: colors.error, marginVertical: 8},
});