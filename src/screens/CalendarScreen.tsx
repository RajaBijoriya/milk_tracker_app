import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {IconButton, Text} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {useMilkStore} from '../store/milkStore';
import {generateDailyRecords, formatLitres, getEffectiveQuantity} from '../services/milkCalculation';
import {monthName, shiftMonth, todayKey} from '../utils/dateUtils';
import CalendarDay from '../components/CalendarDay';
import {colors} from '../theme/colors';
import {canEditDateInWindow} from '../utils/editWindow';
import {getMilkDeliveryStatus} from '../utils/milkStatus';

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const {profile, entries, priceHistory, quantityHistory, selectedMonth, setSelectedMonth, ownerTimezone, statement} = useMilkStore();
  const [month, setMonth] = useState(selectedMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => setMonth(selectedMonth), [selectedMonth]);
  const records = useMemo(() => profile ? generateDailyRecords(month, profile, entries, priceHistory, quantityHistory) : [], [month, profile, entries, priceHistory, quantityHistory]);
  const recordMap = new Map(records.map(record => [record.date, record]));
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1).getDay();
  const last = new Date(year, monthNumber, 0).getDate();
  const cells = Array.from({length: 42}, (_, index) => index - first + 1)
    .map(day => day >= 1 && day <= last ? day : null);

  const changeMonth = (offset: number) => {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelectedMonth(next);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <IconButton icon="chevron-left" iconColor={colors.primary} onPress={() => changeMonth(-1)} />
        <Text variant="titleLarge">{monthName(month)}</Text>
        <IconButton icon="chevron-right" iconColor={colors.primary} onPress={() => changeMonth(1)} />
      </View>
      <View style={styles.week}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <Text key={day} style={styles.weekDay}>{day}</Text>)}</View>
      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} style={styles.emptyDay}/>;
          const date = `${month}-${String(day).padStart(2, '0')}`;
          const record = recordMap.get(date);
          const defaultQuantity = profile
            ? getEffectiveQuantity(date, profile, quantityHistory)
            : null;
          const beforeStart = Boolean(profile && date < profile.startDate);
          const readOnly = beforeStart || !canEditDateInWindow(date, new Date(), ownerTimezone) ||
            (statement?.month === date.slice(0, 7) && statement.readOnly);
          const disabled = beforeStart;
          return (
            <CalendarDay
              key={date}
              day={day}
              quantity={record ? formatLitres(record.quantityMl) : undefined}
              disabled={disabled}
              isToday={date === todayKey()}
              isSelected={date === selectedDate}
              status={getMilkDeliveryStatus(record?.quantityMl, defaultQuantity, Boolean(record))}
              onPress={() => {
                setSelectedDate(date);
                navigation.navigate('Entry', {date, readOnly});
              }}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {backgroundColor: colors.background},
  container: {padding: 12, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  week: {flexDirection: 'row', marginTop: 8},
  weekDay: {width: '14.285%', textAlign: 'center', color: colors.textSecondary, fontSize: 12},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  emptyDay: {width: '14.285%', aspectRatio: 0.82},
});