import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {Button, Card, Text} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {useMilkStore} from '../store/milkStore';
import {formatCurrency, formatLitres} from '../services/milkCalculation';
import {monthName, todayKey} from '../utils/dateUtils';
import MilkLiquidLoader from '../components/MilkLiquidLoader';
import GradientPanel from '../components/GradientPanel';
import {colors} from '../theme/colors';
import {BillingSummary, getBillingSummary} from '../services/api/billingApiService';

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const {profile, summary, loading, offline} = useMilkStore();
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) {
      setBillingSummary(null);
      return;
    }
    let active = true;
    getBillingSummary().then(result => {
      if (active) {
        setBillingSummary(result);
        setBillingError(null);
      }
    }).catch(error => {
      if (active) {
        setBillingSummary(null);
        setBillingError(error instanceof Error ? error.message : 'Payment totals are unavailable.');
      }
    });
    return () => {
      active = false;
    };
  }, [profile]);
  if (!profile) return null;
  const todayRecord = summary?.records.find(record => record.date === todayKey());
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text variant="headlineSmall">{monthName(summary?.month ?? profile.startDate.slice(0, 7))}</Text>
      <Text style={styles.period}>{summary?.isMonthToDate ? 'Month-to-date total' : 'Monthly total'}</Text>
      {loading ? <MilkLiquidLoader size={72} showText={false}/> : null}
      <GradientPanel style={styles.hero}>
        <View style={styles.heroContent}>
          <Text style={styles.heroLabel}>Milk expense</Text>
          <Text variant="headlineLarge" style={styles.heroAmount}>{formatCurrency(summary?.totalAmountPaise ?? 0)}</Text>
          <Text variant="titleMedium" style={styles.heroDetails}>{formatLitres(summary?.totalQuantityMl ?? 0)} consumed</Text>
        </View>
      </GradientPanel>
      <View style={styles.grid}>
        <Card style={styles.smallCard}><Card.Content><Text style={styles.label}>Today's milk</Text><Text variant="titleLarge" style={styles.value}>{formatLitres(todayRecord?.quantityMl ?? profile.defaultQuantityMl)}</Text></Card.Content></Card>
        <Card style={styles.smallCard}><Card.Content><Text style={styles.label}>Today's expense</Text><Text variant="titleLarge" style={styles.value}>{formatCurrency(todayRecord?.amountPaise ?? 0)}</Text></Card.Content></Card>
        <Card style={styles.smallCard}><Card.Content><Text style={styles.label}>Default quantity</Text><Text variant="titleLarge" style={styles.value}>{formatLitres(profile.defaultQuantityMl)}</Text></Card.Content></Card>
        <Card style={styles.smallCard}><Card.Content><Text style={styles.label}>Current price</Text><Text variant="titleLarge" style={styles.value}>{formatCurrency(profile.pricePerLitrePaise)}</Text></Card.Content></Card>
        <Card style={styles.smallCard}><Card.Content><Text style={styles.label}>No-milk days</Text><Text variant="titleLarge" style={styles.value}>{summary?.skippedDays ?? 0}</Text></Card.Content></Card>
        <Card style={styles.smallCard}><Card.Content><Text style={styles.label}>Modified days</Text><Text variant="titleLarge" style={styles.value}>{summary?.modifiedDays ?? 0}</Text></Card.Content></Card>
      </View>
      <Card mode="elevated" style={styles.billingCard}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.billingHeading}>Bills & Payments</Text>
          {billingSummary ? (
            <>
              <View style={styles.billingRow}>
                <View style={styles.billingCell}>
                  <Text style={styles.billingLabel}>Total billed</Text>
                  <Text style={styles.billingValue}>{formatCurrency(billingSummary.totalBilledPaise)}</Text>
                </View>
                <View style={styles.billingCell}>
                  <Text style={styles.billingLabel}>Total paid</Text>
                  <Text style={styles.billingValue}>{formatCurrency(billingSummary.totalPaidPaise)}</Text>
                </View>
              </View>
              <View style={styles.billingRow}>
                <View style={styles.billingCell}>
                  <Text style={styles.billingLabel}>Outstanding</Text>
                  <Text style={[styles.billingValue, styles.outstanding]}>{formatCurrency(billingSummary.totalOutstandingPaise)}</Text>
                </View>
                <View style={styles.billingCell}>
                  <Text style={styles.billingLabel}>Final payable this month</Text>
                  <Text style={styles.billingValue}>{formatCurrency(billingSummary.totalPayablePaise)}</Text>
                </View>
              </View>
              <Text style={styles.billingLabel}>
                {formatCurrency(billingSummary.currentMonthBillPaise)} current bill · {formatCurrency(billingSummary.previousOutstandingPaise)} previous balance
              </Text>
              <Text style={styles.billingLabel}>
                {billingSummary.paidMonths} paid · {billingSummary.partiallyPaidMonths} partial · {billingSummary.unpaidMonths} unpaid months
              </Text>
            </>
          ) : (
            <Text style={styles.billingLabel}>
              {offline ? 'Connect to the internet to view verified payment totals.' : billingError ?? 'Loading payment totals…'}
            </Text>
          )}
          <Button mode="outlined" onPress={() => navigation.navigate('Tabs', {screen: 'Statements'})} style={styles.billingAction}>
            View Bills & Payments
          </Button>
        </Card.Content>
      </Card>
      <Button mode="contained" icon="pencil-outline" style={styles.action} onPress={() => navigation.navigate('Entry', {date: todayKey()})}>Update Today's Milk</Button>
      <View style={styles.actions}>
        <Button mode="outlined" onPress={() => navigation.navigate('Tabs', {screen: 'Calendar'})}>Open Calendar</Button>
        <Button mode="outlined" onPress={() => navigation.navigate('Tabs', {screen: 'Statements'})}>Statement</Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {backgroundColor: colors.background},
  container: {padding: 16, paddingBottom: 32, backgroundColor: colors.background},
  period: {color: colors.textSecondary, marginBottom: 12},
  hero: {borderRadius: 18, marginBottom: 14, elevation: 2},
  heroContent: {padding: 20},
  heroLabel: {color: colors.white},
  heroAmount: {color: colors.white, marginVertical: 4},
  heroDetails: {color: colors.white},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
  smallCard: {width: '48%', marginBottom: 12, borderRadius: 14, backgroundColor: colors.surface},
  billingCard: {marginBottom: 14, borderRadius: 14, backgroundColor: colors.surface},
  billingHeading: {color: colors.text, marginBottom: 12},
  billingRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10},
  billingCell: {width: '48%'},
  billingLabel: {color: colors.textSecondary, marginTop: 4},
  billingValue: {color: colors.text, fontWeight: '700', marginTop: 2},
  outstanding: {color: colors.error},
  billingAction: {marginTop: 12},
  label: {color: colors.textSecondary, minHeight: 36},
  value: {color: colors.text},
  action: {marginTop: 4},
  actions: {marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8},
});