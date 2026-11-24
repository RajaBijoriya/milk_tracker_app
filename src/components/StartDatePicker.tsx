import React, {useMemo, useState} from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {Button, Card, IconButton, Text} from 'react-native-paper';
import {colors} from '../theme/colors';
import {isStartDateAllowed, StartDateRange} from '../utils/startDateRange';

type Props = {
  value: string;
  range: StartDateRange;
  onChange: (date: string) => void;
  disabled?: boolean;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function shiftCalendarMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(year, monthNumber - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

export default function StartDatePicker({value, range, onChange, disabled = false}: Props) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(range.min.slice(0, 7));
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    const [year, month] = visibleMonth.split('-').map(Number);
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const monthLength = new Date(year, month, 0).getDate();
    return [
      ...Array.from({length: firstWeekday}, () => null),
      ...Array.from({length: monthLength}, (_, index) => index + 1),
    ];
  }, [visibleMonth]);

  const open = () => {
    const initial = isStartDateAllowed(value, range) ? value : range.min;
    setDraft(initial);
    setVisibleMonth(initial.slice(0, 7));
    setError(null);
    setVisible(true);
  };

  const confirm = () => {
    if (!isStartDateAllowed(draft, range)) {
      setError(`Choose a date from ${range.min} through ${range.max}.`);
      return;
    }
    onChange(draft);
    setError(null);
    setVisible(false);
  };

  const previousMonth = shiftCalendarMonth(visibleMonth, -1);
  const nextMonth = shiftCalendarMonth(visibleMonth, 1);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tracking start date ${value}. Select a date`}
        disabled={disabled}
        onPress={open}
        style={[styles.dateField, disabled && styles.disabled]}>
        <Text style={styles.label}>Tracking start date</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value}</Text>
          <IconButton icon="calendar-month" size={20} iconColor={colors.primary} onPress={open} disabled={disabled}/>
        </View>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Card mode="elevated" style={styles.dialog}>
            <Card.Content>
              <Text variant="titleLarge" style={styles.title}>Choose start date</Text>
              <Text style={styles.rangeText}>Allowed: {range.min} to {range.max}</Text>
              <View style={styles.monthHeader}>
                <IconButton
                  accessibilityLabel="Previous month"
                  icon="chevron-left"
                  iconColor={colors.primary}
                  disabled={previousMonth < range.min.slice(0, 7)}
                  onPress={() => setVisibleMonth(previousMonth)}
                />
                <Text variant="titleMedium" style={styles.monthTitle}>{monthLabel(visibleMonth)}</Text>
                <IconButton
                  accessibilityLabel="Next month"
                  icon="chevron-right"
                  iconColor={colors.primary}
                  disabled={nextMonth > range.max.slice(0, 7)}
                  onPress={() => setVisibleMonth(nextMonth)}
                />
              </View>
              <View style={styles.calendarGrid}>
                {WEEKDAYS.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
                {days.map((day, index) => {
                  if (day === null) return <View key={`empty-${index}`} style={styles.dayCell}/>;
                  const date = `${visibleMonth}-${String(day).padStart(2, '0')}`;
                  const allowed = isStartDateAllowed(date, range);
                  const selected = date === draft;
                  return (
                    <Pressable
                      key={date}
                      accessibilityRole="button"
                      accessibilityLabel={date}
                      accessibilityState={{disabled: !allowed, selected}}
                      disabled={!allowed}
                      onPress={() => {setDraft(date); setError(null);}}
                      style={[styles.dayCell, selected && styles.selectedDay, !allowed && styles.unavailableDay]}>
                      <Text style={[styles.dayText, selected && styles.selectedDayText, !allowed && styles.unavailableText]}>
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Button onPress={() => setVisible(false)}>Cancel</Button>
                <Button mode="contained" onPress={confirm} disabled={!isStartDateAllowed(draft, range)}>Select date</Button>
              </View>
            </Card.Content>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dateField: {
    marginTop: 12,
    minHeight: 58,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 4,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  disabled: {opacity: 0.6},
  label: {fontSize: 12, color: colors.textSecondary},
  valueRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  value: {color: colors.text, fontSize: 16},
  overlay: {flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(15, 41, 66, 0.38)'},
  dialog: {width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: 18, backgroundColor: colors.white},
  title: {color: colors.text},
  rangeText: {color: colors.textSecondary, marginTop: 4},
  monthHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8},
  monthTitle: {color: colors.text},
  calendarGrid: {flexDirection: 'row', flexWrap: 'wrap'},
  weekday: {width: '14.285%', textAlign: 'center', color: colors.textSecondary, fontSize: 12, paddingVertical: 8},
  dayCell: {width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 24},
  selectedDay: {backgroundColor: colors.primary},
  unavailableDay: {opacity: 0.35},
  dayText: {color: colors.text},
  selectedDayText: {color: colors.white, fontWeight: '700'},
  unavailableText: {color: colors.textSecondary},
  error: {color: colors.error, marginTop: 8},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16},
});
