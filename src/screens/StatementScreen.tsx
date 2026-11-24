import React, {useEffect, useState} from 'react';
import {Alert, ScrollView, StyleSheet, View} from 'react-native';
import {Button, DataTable, IconButton, Text} from 'react-native-paper';
import {useMilkStore} from '../store/milkStore';
import {generateDailyRecords, formatCurrency, formatLitres} from '../services/milkCalculation';
import {monthKey, monthName, shiftMonth} from '../utils/dateUtils';
import {generateAndSharePdf} from '../services/pdfService';
import MilkLiquidLoader from '../components/MilkLiquidLoader';
import GradientPanel from '../components/GradientPanel';
import {colors} from '../theme/colors';

export default function StatementScreen() {
  const {
    profile, entries, priceHistory, quantityHistory, selectedMonth, setSelectedMonth,
    loading, statement, statementLoading, statementError, offline,
  } = useMilkStore();
  const [month, setMonth] = useState(selectedMonth);
  useEffect(() => setMonth(selectedMonth), [selectedMonth]);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const calculatedRecords = profile ? generateDailyRecords(month, profile, entries, priceHistory, quantityHistory,
    month === monthKey(new Date()) ? new Date().toISOString().slice(0, 10) : undefined) : [];
  const activeStatement = statement?.month === month ? statement : null;
  const records = activeStatement?.records ?? (statementLoading ? [] : calculatedRecords);
  const totalQuantity = records.reduce((sum, record) => sum + record.quantityMl, 0);
  const totalAmount = activeStatement?.totalAmountPaise ?? records.reduce((sum, record) => sum + record.amountPaise, 0);
  const skipped = activeStatement?.skippedDays ?? records.filter(record => record.isSkipped).length;
  const modified = activeStatement?.modifiedDays ?? records.filter(record => record.isModified).length;

  const changeMonth = (offset: number) => {
    const next = shiftMonth(month, offset);
    if (profile && next < profile.startDate.slice(0, 7)) return;
    setMonth(next);
    setSelectedMonth(next);
  };
  const download = async () => {
    if (!profile) return;
    setGeneratingPdf(true);
    try {
      await generateAndSharePdf(profile, month, records);
    } catch (error) {
      Alert.alert('PDF failed', error instanceof Error ? error.message : 'Unable to generate the statement');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <IconButton icon="chevron-left" iconColor={colors.primary} disabled={Boolean(profile && month <= profile.startDate.slice(0, 7))} onPress={() => changeMonth(-1)} />
        <Text variant="titleLarge">{monthName(month)}{month === monthKey(new Date()) ? ' (Month-to-date)' : ''}</Text>
        <IconButton icon="chevron-right" iconColor={colors.primary} disabled={month >= monthKey(new Date())} onPress={() => changeMonth(1)} />
      </View>
      <GradientPanel style={styles.totals}>
        <View style={styles.totalsContent}>
          <Text variant="titleMedium" style={styles.totalText}>Total: {formatCurrency(totalAmount)}</Text>
          <Text style={styles.totalText}>Milk: {formatLitres(totalQuantity)}</Text>
          <Text style={styles.totalText}>Skipped: {skipped}  |  Modified: {modified}</Text>
          <Text style={styles.totalText}>
            {activeStatement?.status === 'finalized' ? 'Finalized · read-only' : 'Provisional statement'}
            {offline ? ' · Offline copy' : ''}
          </Text>
        </View>
      </GradientPanel>
      {loading || statementLoading ? <MilkLiquidLoader size={72} showText={false}/> : null}
      {statementError ? <Text style={styles.error}>{statementError}</Text> : null}
      <ScrollView horizontal>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title>Date</DataTable.Title>
            <DataTable.Title numeric>Quantity</DataTable.Title>
            <DataTable.Title numeric>Price/L</DataTable.Title>
            <DataTable.Title numeric>Amount</DataTable.Title>
          </DataTable.Header>
          {records.map(record => (
            <DataTable.Row key={record.date} style={styles.tableRow}>
              <DataTable.Cell>{record.date.slice(-2)}</DataTable.Cell>
              <DataTable.Cell numeric>{formatLitres(record.quantityMl)}</DataTable.Cell>
              <DataTable.Cell numeric>{formatCurrency(record.pricePerLitrePaise)}</DataTable.Cell>
              <DataTable.Cell numeric>{formatCurrency(record.amountPaise)}</DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      </ScrollView>
      {generatingPdf ? <MilkLiquidLoader size={72} showText={false}/> : null}
      <Button
        mode="contained"
        icon="file-pdf-box"
        onPress={download}
        disabled={generatingPdf || statementLoading || !profile}
        style={styles.button}>
        {generatingPdf ? 'Generating PDF…' : 'Download PDF'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {backgroundColor: colors.background},
  container: {padding: 12, paddingBottom: 32, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  totals: {borderRadius: 14, marginBottom: 12},
  totalsContent: {padding: 16, gap: 4},
  totalText: {color: colors.white},
  tableRow: {backgroundColor: colors.surface, borderRadius: 8, marginBottom: 4},
  button: {marginTop: 16, borderRadius: 12},
  error: {color: colors.error, marginVertical: 8},
});