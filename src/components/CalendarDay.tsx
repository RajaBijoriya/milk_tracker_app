import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import {colors} from '../theme/colors';
import {MilkDeliveryStatus, getMilkDeliveryColors, getMilkDeliveryLabel} from '../utils/milkStatus';

type Props = {
  day: number;
  quantity?: string;
  disabled?: boolean;
  isToday?: boolean;
  isSelected?: boolean;
  status?: MilkDeliveryStatus;
  onPress: () => void;
};

export default function CalendarDay({
  day,
  quantity,
  disabled = false,
  isToday = false,
  isSelected = false,
  status = 'none',
  onPress,
}: Props) {
  const statusColors = getMilkDeliveryColors(status);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${day}${quantity ? `, ${quantity}` : ''}, ${getMilkDeliveryLabel(status)}`}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.day,
        {backgroundColor: statusColors.backgroundColor},
        isSelected && styles.selected,
        isToday && styles.today,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.dayNumber, {color: statusColors.textColor}]}>{day}</Text>
      {quantity ? <Text numberOfLines={1} style={[styles.quantity, {color: statusColors.textColor}]}>{quantity}</Text> : null}
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
    backgroundColor: colors.milkNeutralBackground,
  },
  selected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  today: {
    borderColor: colors.primaryDark,
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
    marginTop: 2,
  },
});