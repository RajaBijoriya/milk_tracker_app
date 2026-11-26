import {colors} from '../theme/colors';

export type MilkDeliveryStatus = 'normal' | 'no_milk' | 'less' | 'more' | 'none';

export function getMilkDeliveryStatus(
  quantityMl: number | null | undefined,
  defaultQuantityMl: number | null | undefined,
  hasRecord: boolean,
): MilkDeliveryStatus {
  if (!hasRecord || quantityMl === null || quantityMl === undefined) return 'none';
  if (quantityMl === 0) return 'no_milk';
  if (defaultQuantityMl === null || defaultQuantityMl === undefined || quantityMl === defaultQuantityMl) {
    return 'normal';
  }
  return quantityMl < defaultQuantityMl ? 'less' : 'more';
}

export function getMilkDeliveryColors(status: MilkDeliveryStatus) {
  switch (status) {
    case 'normal':
      return {backgroundColor: colors.milkNormalBackground, textColor: colors.milkNormalText};
    case 'no_milk':
      return {backgroundColor: colors.milkNoMilkBackground, textColor: colors.milkNoMilkText};
    case 'less':
      return {backgroundColor: colors.milkLessBackground, textColor: colors.milkLessText};
    case 'more':
      return {backgroundColor: colors.milkMoreBackground, textColor: colors.milkMoreText};
    default:
      return {backgroundColor: colors.milkNeutralBackground, textColor: colors.milkNeutralText};
  }
}

export function getMilkDeliveryLabel(status: MilkDeliveryStatus): string {
  switch (status) {
    case 'normal':
      return 'Normal milk';
    case 'no_milk':
      return 'No milk';
    case 'less':
      return 'Less milk';
    case 'more':
      return 'More milk';
    default:
      return 'No entry';
  }
}
