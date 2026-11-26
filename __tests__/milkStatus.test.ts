import {colors} from '../src/theme/colors';
import {
  getMilkDeliveryColors,
  getMilkDeliveryStatus,
} from '../src/utils/milkStatus';

test('classifies delivery amounts consistently and keeps unrecorded days neutral', () => {
  expect(getMilkDeliveryStatus(1000, 1000, true)).toBe('normal');
  expect(getMilkDeliveryStatus(0, 1000, true)).toBe('no_milk');
  expect(getMilkDeliveryStatus(500, 1000, true)).toBe('less');
  expect(getMilkDeliveryStatus(1500, 1000, true)).toBe('more');
  expect(getMilkDeliveryStatus(undefined, 1000, false)).toBe('none');

  expect(getMilkDeliveryColors('normal').backgroundColor).toBe(colors.milkNormalBackground);
  expect(getMilkDeliveryColors('no_milk').backgroundColor).toBe(colors.milkNoMilkBackground);
  expect(getMilkDeliveryColors('less').backgroundColor).toBe(colors.milkLessBackground);
  expect(getMilkDeliveryColors('more').backgroundColor).toBe(colors.milkMoreBackground);
  expect(getMilkDeliveryColors('none').backgroundColor).toBe(colors.milkNeutralBackground);
});
