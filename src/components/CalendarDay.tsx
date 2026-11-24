import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors} from '../theme/colors';

type Props = {
  day: number;
  quantity?: string;
  disabled?: boolean;
  isToday?: boolean;
  isSelected?: boolean;
  isSkipped?: boolean;
  isModified?: boolean;
  isDelivery?: boolean;
  onPress: () => void;
};

export default function CalendarDay({
  day,
  quantity,
  disabled = false,
  isToday = false,
  isSelected = false,
  isSkipped = false,
  isModified = false,
  isDelivery = false,
  onPress,
}: Props) {
  const statusColor = isSkipped
    ? colors.error
    : isModified
      ? colors.warning
      : isDelivery
        ? colors.success
        : colors.textSecondary;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${day}${quantity ? `, ${quantity}` : ''}${isSkipped ? ', no milk' : ''}${isModified ? ', modified' : ''}`}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.day,
        isSelected && styles.selected,
        isToday && styles.today,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.dayNumber, {color: statusColor}]}>{day}</Text>
      {quantity ? <Text numberOfLines={1} style={styles.quantity}>{quantity}</Text> : null}
      {isDelivery || isSkipped || isModified ? (
        <View style={[styles.indicator, {backgroundColor: statusColor}]}/>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  day: {
    width: '14.285%',
    aspectRatio: 0.82,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  selected: {
    backgroundColor: colors.surface,
  },
  today: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.42,
  },
  dayNumber: {
    fontWeight: '700',
  },
  quantity: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  indicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2,
  },
});