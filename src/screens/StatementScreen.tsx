import React, {useEffect, useRef, useState} from 'react';
import {Alert, Modal, ScrollView, StyleSheet, View} from 'react-native';
import {Button, Card, DataTable, IconButton, RadioButton, SegmentedButtons, Text, TextInput} from 'react-native-paper';
import {useMilkStore} from '../store/milkStore';
import {generateDailyRecords, formatCurrency, formatLitres} from '../services/milkCalculation';
import {monthKey, monthName, shiftMonth} from '../utils/dateUtils';
import {generateAndSharePdf} from '../services/pdfService';
import MilkLiquidLoader from '../components/MilkLiquidLoader';
import GradientPanel from '../components/GradientPanel';
import FormScrollView from '../components/FormScrollView';
import {colors} from '../theme/colors';
import {ApiError} from '../services/api/apiClient';
import {
  BillingMonth,
  BillDetails,
  PaymentMethod,
  getBill,
  recordPayment,
} from '../services/api/billingApiService';
import {getEffectiveQuantity} from '../services/milkCalculation';
import {getMilkDeliveryColors, getMilkDeliveryLabel, getMilkDeliveryStatus} from '../utils/milkStatus';
import {dateKeyInTimezone} from '../utils/editWindow';

type PaymentAllocationMode = 'oldest' | 'selected';

function paymentStatusLabel(status: BillingMonth['paymentStatus']): string {
  switch (status) {
    case 'paid':
      return 'PAID';
    case 'partially_paid':
      return 'PARTIALLY PAID';
    default:
      return 'UNPAID';
  }
}

function paymentStatusColor(status: BillingMonth['paymentStatus']): string {
  switch (status) {
    case 'paid':
      return colors.success;
    case 'partially_paid':
      return colors.warning;
    default:
      return colors.error;
  }
}

function parseAmountPaise(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const paise = whole * 100 + fraction;
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default function StatementScreen() {
  const {
    profile, entries, priceHistory, quantityHistory, selectedMonth, setSelectedMonth,
    loading, statement, statementLoading, statementError, offline, ownerTimezone,
  } = useMilkStore();
  const [month, setMonth] = useState(selectedMonth);
  const [billDetails, setBillDetails] = useState<BillDetails | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(dateKeyInTimezone(new Date(), ownerTimezone));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [allocationMode, setAllocationMode] = useState<PaymentAllocationMode>('oldest');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentRetryRequired, setPaymentRetryRequired] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const pendingRequest = useRef<{
    idempotencyKey: string;
    amountPaise: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
    month?: string;
  } | null>(null);

  useEffect(() => setMonth(selectedMonth), [selectedMonth]);

  useEffect(() => {
    if (!profile) {
      setBillDetails(null);
      return;
    }
    let active = true;
    setBillingLoading(true);
    setBillingError(null);
    getBill(month).then(details => {
      if (active) setBillDetails(details);
    }).catch(error => {
      if (active) {
        setBillDetails(null);
        setBillingError(error instanceof Error ? error.message : 'Unable to load payment information.');
      }
    }).finally(() => {
      if (active) setBillingLoading(false);
    });
    return () => {
      active = false;
    };
  }, [month, profile]);

  const calculatedRecords = profile ? generateDailyRecords(
    month,
    profile,
    entries,
    priceHistory,
    quantityHistory,
    month === monthKey(new Date()) ? dateKeyInTimezone(new Date(), ownerTimezone) : undefined,
  ) : [];
  const activeStatement = statement?.month === month ? statement : null;
  const records = billDetails?.month === month
    ? billDetails.records
    : activeStatement?.records ?? (statementLoading ? [] : calculatedRecords);
  const totalQuantity = billDetails?.month === month
    ? billDetails.totalQuantityMl
    : activeStatement?.totalQuantityMl ?? records.reduce((sum, record) => sum + record.quantityMl, 0);
  const totalAmount = billDetails?.month === month
    ? billDetails.totalAmountPaise
    : activeStatement?.totalAmountPaise ?? records.reduce((sum, record) => sum + record.amountPaise, 0);
  const skipped = billDetails?.month === month
    ? billDetails.skippedDays
    : activeStatement?.skippedDays ?? records.filter(record => record.isSkipped).length;
  const modified = billDetails?.month === month
    ? billDetails.modifiedDays
    : activeStatement?.modifiedDays ?? records.filter(record => record.isModified).length;

  const changeMonth = (next: string) => {
    if (pendingRequest.current) {
      Alert.alert('Payment confirmation pending', 'Retry the pending payment request before changing months.');
      return;
    }
    if (profile && next < profile.startDate.slice(0, 7)) return;
    setMonth(next);
    setSelectedMonth(next);
  };
  const download = async () => {
    if (!profile || !billDetails || billDetails.month !== month) return;
    setGeneratingPdf(true);
    try {
      await generateAndSharePdf(profile, month, records, quantityHistory, billDetails);
    } catch (error) {
      Alert.alert('PDF failed', error instanceof Error ? error.message : 'Unable to generate the statement');
    } finally {
      setGeneratingPdf(false);
    }
  };
  const openPaymentForm = () => {
    const pending = pendingRequest.current;
    if (pending) {
      setPaymentAmount(`${Math.floor(pending.amountPaise / 100)}.${String(pending.amountPaise % 100).padStart(2, '0')}`);
      setPaymentDate(pending.paymentDate);
      setPaymentMethod(pending.paymentMethod);
      setPaymentNote(pending.note);
      setAllocationMode(pending.month ? 'selected' : 'oldest');
    } else {
      setPaymentAmount('');
      setPaymentDate(dateKeyInTimezone(new Date(), ownerTimezone));
      setPaymentMethod('cash');
      setPaymentNote('');
      setAllocationMode('oldest');
    }
    setPaymentError(null);
    setPaymentSuccess(null);
    setPaymentModalVisible(true);
  };

  const submitPayment = async () => {
    const amountPaise = parseAmountPaise(paymentAmount);
    if (!amountPaise) {
      setPaymentError('Enter an amount greater than zero with no more than two decimal places.');
      return;
    }
    if (!isValidDate(paymentDate)) {
      setPaymentError('Enter a valid payment date in YYYY-MM-DD format.');
      return;
    }
    if (paymentDate > dateKeyInTimezone(new Date(), ownerTimezone)) {
      setPaymentError('A payment date cannot be in the future.');
      return;
    }
    if (offline) {
      setPaymentError('Payments require an internet connection and are not queued offline.');
      return;
    }
    if (!pendingRequest.current) {
      pendingRequest.current = {
        idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
        amountPaise,
        paymentDate,
        paymentMethod,
        note: paymentNote.trim(),
        ...(allocationMode === 'selected' ? {month} : {}),
      };
    }
    setPaymentBusy(true);
    setPaymentRetryRequired(false);
    setPaymentError(null);
    try {
      await recordPayment(pendingRequest.current);
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        pendingRequest.current = null;
        setPaymentRetryRequired(false);
      } else {
        setPaymentRetryRequired(true);
      }
      setPaymentError(error instanceof Error
        ? error.message
        : 'Payment confirmation is unknown. Retry the same request before submitting another payment.');
      setPaymentBusy(false);
      return;
    }
    pendingRequest.current = null;
    setPaymentRetryRequired(false);
    setPaymentSuccess('Payment accepted by the server.');
    setPaymentModalVisible(false);
    setPaymentAmount('');
    try {
      const refreshed = await getBill(month);
      setBillDetails(refreshed);
      setBillingError(null);
    } catch (error) {
      setBillingError(error instanceof Error
        ? `Payment was accepted, but billing details could not refresh: ${error.message}`
        : 'Payment was accepted, but billing details could not refresh.');
    } finally {
      setPaymentBusy(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <IconButton
            icon="chevron-left"
            iconColor={colors.primary}
            disabled={Boolean(profile && month <= profile.startDate.slice(0, 7))}
            onPress={() => changeMonth(shiftMonth(month, -1))}
          />
          <Text variant="titleLarge">{monthName(month)}{month === monthKey(new Date()) ? ' (Month-to-date)' : ''}</Text>
          <IconButton
            icon="chevron-right"
            iconColor={colors.primary}
            disabled={month >= monthKey(new Date())}
            onPress={() => changeMonth(shiftMonth(month, 1))}
          />
        </View>
        <GradientPanel style={styles.totals}>
          <View style={styles.totalsContent}>
            <Text variant="titleMedium" style={styles.totalText}>Milk bill: {formatCurrency(totalAmount)}</Text>
            <Text style={styles.totalText}>Milk: {formatLitres(totalQuantity)}</Text>
            <Text style={styles.totalText}>Skipped: {skipped}  |  Modified: {modified}</Text>
            <Text style={styles.totalText}>
              {(billDetails?.month === month ? billDetails.status : activeStatement?.status) === 'finalized'
                ? 'Finalized · read-only'
                : 'Provisional statement'}
              {offline ? ' · Offline copy' : ''}
            </Text>
          </View>
        </GradientPanel>

        {billingLoading ? <MilkLiquidLoader size={56} showText={false}/> : null}
        {billingError ? (
          <Text style={styles.error}>
            {offline ? 'Payment information needs an internet connection. ' : ''}
            {billingError}
          </Text>
        ) : null}
        {billDetails?.month === month ? (
          <>
            <Card mode="elevated" style={styles.billingCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Bills & Payments</Text>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Month bill</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(billDetails.totalAmountPaise)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Previous balance</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(billDetails.previousOutstandingPaise)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Amount paid</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(billDetails.amountPaidPaise)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Remaining this month</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(billDetails.remainingAmountPaise)}</Text>
                  </View>
                </View>
                <Text variant="titleLarge" style={styles.payable}>
                  Total payable: {formatCurrency(billDetails.totalPayablePaise)}
                </Text>
                <Text style={styles.statusCounts}>
                  All months · {billDetails.billingSummary.paidMonths} paid · {billDetails.billingSummary.partiallyPaidMonths} partial · {billDetails.billingSummary.unpaidMonths} unpaid
                </Text>
                <Text style={[styles.billStatus, {color: paymentStatusColor(billDetails.paymentStatus)}]}>
                  {monthName(month)}: {paymentStatusLabel(billDetails.paymentStatus)}
                </Text>
                <Button
                  mode="contained"
                  icon="cash-plus"
                  onPress={openPaymentForm}
                  disabled={billingLoading || offline || billDetails.billingSummary.totalOutstandingPaise === 0}
                  style={styles.paymentButton}>
                  Record Payment
                </Button>
                {paymentSuccess ? <Text style={styles.success}>{paymentSuccess}</Text> : null}
              </Card.Content>
            </Card>

            <Card mode="elevated" style={styles.billingCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Monthly bills</Text>
                {billDetails.bills.slice().reverse().map(bill => (
                  <Button
                    key={bill.month}
                    mode={bill.month === month ? 'contained-tonal' : 'text'}
                    contentStyle={styles.billListItem}
                    onPress={() => changeMonth(bill.month)}>
                    <View style={styles.billListContent}>
                      <Text style={styles.billMonth}>{monthName(bill.month)}</Text>
                      <Text style={styles.billAmount}>{formatCurrency(bill.totalAmountPaise)}</Text>
                      <Text style={[styles.billStatus, {color: paymentStatusColor(bill.paymentStatus)}]}>
                        {paymentStatusLabel(bill.paymentStatus)}
                      </Text>
                    </View>
                  </Button>
                ))}
              </Card.Content>
            </Card>

            <Card mode="elevated" style={styles.billingCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Payment history · {monthName(month)}</Text>
                {billDetails.paymentHistory.length ? billDetails.paymentHistory.map(payment => (
                  <View key={payment.id} style={styles.paymentHistoryRow}>
                    <View style={styles.historyDetails}>
                      <Text style={styles.historyAmount}>{formatCurrency(payment.amountPaise)}</Text>
                      <Text style={styles.historyNote}>
                        {payment.paymentDate} · {payment.paymentMethod.replace('_', ' ').toUpperCase()}
                      </Text>
                      {payment.note ? <Text style={styles.historyNote}>{payment.note}</Text> : null}
                    </View>
                    <Text style={styles.success}>Accepted</Text>
                  </View>
                )) : <Text style={styles.summaryLabel}>No payments recorded for this month.</Text>}
              </Card.Content>
            </Card>
          </>
        ) : null}

        {loading || statementLoading ? <MilkLiquidLoader size={72} showText={false}/> : null}
        {statementError ? <Text style={styles.error}>{statementError}</Text> : null}
        <ScrollView horizontal>
          <DataTable>
            <DataTable.Header>
              <DataTable.Title>Date</DataTable.Title>
              <DataTable.Title numeric>Quantity</DataTable.Title>
              <DataTable.Title numeric>Price/L</DataTable.Title>
              <DataTable.Title numeric>Amount</DataTable.Title>
              <DataTable.Title>Delivery</DataTable.Title>
            </DataTable.Header>
            {records.map(record => {
              const status = getMilkDeliveryStatus(
                record.quantityMl,
                profile ? getEffectiveQuantity(record.date, profile, quantityHistory) : null,
                true,
              );
              const statusColors = getMilkDeliveryColors(status);
              return (
                <DataTable.Row key={record.date} style={[styles.tableRow, {backgroundColor: statusColors.backgroundColor}]}>
                  <DataTable.Cell>{record.date.slice(-2)}</DataTable.Cell>
                  <DataTable.Cell numeric>{formatLitres(record.quantityMl)}</DataTable.Cell>
                  <DataTable.Cell numeric>{formatCurrency(record.pricePerLitrePaise)}</DataTable.Cell>
                  <DataTable.Cell numeric>{formatCurrency(record.amountPaise)}</DataTable.Cell>
                  <DataTable.Cell><Text style={{color: statusColors.textColor}}>{getMilkDeliveryLabel(status)}</Text></DataTable.Cell>
                </DataTable.Row>
              );
            })}
          </DataTable>
        </ScrollView>
        {generatingPdf ? <MilkLiquidLoader size={72} showText={false}/> : null}
        <Button
          mode="contained"
          icon="file-pdf-box"
          onPress={download}
          disabled={generatingPdf || statementLoading || billingLoading || !profile || !billDetails}
          style={styles.button}>
          {generatingPdf ? 'Generating PDF…' : 'Download PDF'}
        </Button>
      </ScrollView>

      <Modal
        visible={paymentModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!paymentBusy) setPaymentModalVisible(false);
        }}>
        <View style={styles.modalBackdrop}>
          <FormScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled">
            <Card mode="elevated" style={styles.paymentForm}>
              <Card.Content>
                <Text variant="titleLarge" style={styles.sectionTitle}>Record payment</Text>
                <Text style={styles.summaryLabel}>
                  {allocationMode === 'oldest'
                    ? 'Payment will be applied to the oldest outstanding month first.'
                    : `Payment will be applied only to ${monthName(month)}.`}
                </Text>
                <TextInput
                  label="Amount (₹)"
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  style={styles.paymentField}
                  disabled={paymentBusy || paymentRetryRequired}
                />
                <TextInput
                  label="Payment date (YYYY-MM-DD)"
                  value={paymentDate}
                  onChangeText={setPaymentDate}
                  mode="outlined"
                  style={styles.paymentField}
                  disabled={paymentBusy || paymentRetryRequired}
                />
                <Text style={styles.summaryLabel}>Payment method</Text>
                <SegmentedButtons
                  value={paymentMethod}
                  onValueChange={value => setPaymentMethod(value as PaymentMethod)}
                  buttons={[
                    {value: 'cash', label: 'Cash', disabled: paymentBusy || paymentRetryRequired},
                    {value: 'upi', label: 'UPI', disabled: paymentBusy || paymentRetryRequired},
                    {value: 'bank_transfer', label: 'Bank', disabled: paymentBusy || paymentRetryRequired},
                    {value: 'other', label: 'Other', disabled: paymentBusy || paymentRetryRequired},
                  ]}
                  style={styles.methods}
                />
                <TextInput
                  label="Note (optional)"
                  value={paymentNote}
                  onChangeText={setPaymentNote}
                  mode="outlined"
                  style={styles.paymentField}
                  disabled={paymentBusy || paymentRetryRequired}
                />
                <RadioButton.Group
                  value={allocationMode}
                  onValueChange={value => setAllocationMode(value as PaymentAllocationMode)}>
                  <RadioButton.Item label="Oldest outstanding first" value="oldest" disabled={paymentBusy || paymentRetryRequired}/>
                  <RadioButton.Item label={`Only ${monthName(month)}`} value="selected" disabled={paymentBusy || paymentRetryRequired}/>
                </RadioButton.Group>
                {paymentError ? <Text style={styles.error}>{paymentError}</Text> : null}
                {offline ? <Text style={styles.error}>Payments cannot be submitted while offline.</Text> : null}
                <Button mode="contained" onPress={submitPayment} disabled={paymentBusy || offline} style={styles.paymentButton}>
                  {paymentBusy ? 'Saving payment…' : paymentRetryRequired ? 'Retry payment confirmation' : 'Save Payment'}
                </Button>
                <Button onPress={() => setPaymentModalVisible(false)} disabled={paymentBusy}>Cancel</Button>
              </Card.Content>
            </Card>
          </FormScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  container: {padding: 12, paddingBottom: 32, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  totals: {borderRadius: 14, marginBottom: 12},
  totalsContent: {padding: 16, gap: 4},
  totalText: {color: colors.white},
  billingCard: {backgroundColor: colors.surface, borderRadius: 16, marginBottom: 14},
  sectionTitle: {color: colors.text, marginBottom: 10},
  summaryGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
  summaryItem: {width: '48%', paddingVertical: 8},
  summaryLabel: {color: colors.textSecondary},
  summaryValue: {color: colors.text, fontWeight: '700', marginTop: 4},
  payable: {color: colors.primary, fontWeight: '700', marginTop: 8},
  statusCounts: {color: colors.textSecondary, marginTop: 8},
  billStatus: {fontWeight: '700', marginTop: 8},
  paymentButton: {marginTop: 14},
  billListItem: {justifyContent: 'flex-start', height: 'auto', paddingVertical: 8},
  billListContent: {width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  billMonth: {flex: 1, color: colors.text, textAlign: 'left'},
  billAmount: {color: colors.text, fontWeight: '600'},
  paymentHistoryRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border},
  historyDetails: {flex: 1},
  historyAmount: {color: colors.text, fontWeight: '700'},
  historyNote: {color: colors.textSecondary, marginTop: 2},
  tableRow: {borderRadius: 8, marginBottom: 4},
  button: {marginTop: 16, borderRadius: 12},
  error: {color: colors.error, marginVertical: 8},
  success: {color: colors.success, marginTop: 8},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(15,41,66,0.5)', justifyContent: 'center', padding: 16},
  modalScroll: {maxHeight: '100%'},
  modalContent: {paddingVertical: 20},
  paymentForm: {backgroundColor: colors.white, borderRadius: 18},
  paymentField: {marginTop: 12, backgroundColor: colors.white},
  methods: {marginTop: 8},
});
