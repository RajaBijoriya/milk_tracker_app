import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet} from 'react-native';
import {Button, Card, SegmentedButtons, Text, TextInput} from 'react-native-paper';
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {RootStackParamList} from '../navigation/AppNavigator';
import {useMilkStore} from '../store/milkStore';
import {calculateDailyAmount, formatCurrency} from '../services/milkCalculation';
import {getEffectivePrice, getEffectiveQuantity} from '../services/milkCalculation';
import {todayKey} from '../utils/dateUtils';
import {colors} from '../theme/colors';
import MilkLiquidLoader from '../components/MilkLiquidLoader';
import {canEditDateInWindow} from '../utils/editWindow';
import FormScrollView from '../components/FormScrollView';

export default function EntryScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Entry'>>();
  const navigation = useNavigation();
  const {
    profile, entries, priceHistory, quantityHistory, saveEntry, resetEntry,
    statement, statementLoading, selectedMonth, ownerTimezone, offline,
  } = useMilkStore();
  const date = route.params?.date ?? todayKey();
  const month = date.slice(0, 7);
  const readOnly = Boolean(route.params?.readOnly) ||
    !canEditDateInWindow(date, new Date(), ownerTimezone) ||
    Boolean(profile && date < profile.startDate) ||
    Boolean(statement?.month === month && statement.readOnly) ||
    Boolean(statementLoading && selectedMonth === month && statement?.month !== month) ||
    offline;
  const existing = entries.find(entry => entry.entryDate === date);
  const existingQuantityMl = existing?.quantityMl;
  const existingNote = existing?.note;
  const defaultQuantity = profile ? getEffectiveQuantity(date, profile, quantityHistory) : 1000;
  const price = profile ? getEffectivePrice(date, profile, priceHistory) : 0;
  const [quantity, setQuantity] = useState(existing ? String(existing.quantityMl / 1000) : String(defaultQuantity / 1000));
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setQuantity(existingQuantityMl !== undefined
      ? String(existingQuantityMl / 1000)
      : String(defaultQuantity / 1000));
    setNote(existingNote ?? '');
  }, [date, existingQuantityMl, existingNote, defaultQuantity]);
  const quantityMl = Math.round(Number(quantity) * 1000);
  const valid = Number.isFinite(quantityMl) && quantityMl >= 0;
  const amount = valid ? calculateDailyAmount(quantityMl, price) : 0;

  const save = async () => {
    if (!valid) { Alert.alert('Invalid quantity', 'Enter a non-negative decimal quantity.'); return; }
    setBusy(true);
    try { await saveEntry(date, quantityMl, note); navigation.goBack(); }
    catch (error) { Alert.alert('Unable to save', error instanceof Error ? error.message : 'Please try again'); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try { await resetEntry(date); navigation.goBack(); }
    catch (error) { Alert.alert('Unable to reset', error instanceof Error ? error.message : 'Please try again'); }
    finally { setBusy(false); }
  };

  return (
    <FormScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card mode="elevated" style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge">{date}</Text>
          {readOnly ? (
            <Text style={styles.readOnlyNotice}>
              {offline ? 'Offline mode is read-only. Connect to the internet to make changes.' : 'This date is read-only under the account editing policy or finalized statement.'}
            </Text>
          ) : null}
          <SegmentedButtons
            value={quantity}
            onValueChange={setQuantity}
            buttons={[
              {value: '0', label: 'No milk'},
              {value: String(defaultQuantity / 2000), label: 'Less'},
              {value: String(defaultQuantity * 1.5 / 1000), label: 'Extra'},
            ]}
            style={styles.segmented}
          />
          <TextInput label="Quantity (litres)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" mode="outlined" style={styles.field}/>
          <TextInput label="Note (optional)" value={note} onChangeText={setNote} mode="outlined" style={styles.field}/>
          <Text variant="titleMedium" style={styles.amount}>Daily expense: {formatCurrency(amount)}</Text>
          {busy ? <MilkLiquidLoader size={56} showText={false}/> : null}
          {!readOnly ? <Button mode="contained" icon="content-save-outline" onPress={save} disabled={busy} style={styles.button}>Save Entry</Button> : null}
          {!readOnly && existing ? <Button mode="outlined" onPress={reset} disabled={busy} style={styles.button}>Reset to Default</Button> : null}
          <Button onPress={() => navigation.goBack()} disabled={busy}>Cancel</Button>
        </Card.Content>
      </Card>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {backgroundColor: colors.background},
  container: {padding: 16, paddingBottom: 32, backgroundColor: colors.background},
  card: {borderRadius: 16, backgroundColor: colors.surface},
  segmented: {marginTop: 16},
  field: {marginTop: 12},
  amount: {marginVertical: 16},
  readOnlyNotice: {color: colors.warning, marginTop: 8},
  button: {marginBottom: 8},
});