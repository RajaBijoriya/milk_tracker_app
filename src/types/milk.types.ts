export type MilkProfile = {
  id: number;
  cloudId?: string;
  name: string;
  defaultQuantityMl: number;
  pricePerLitrePaise: number;
  startDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MilkEntry = {
  id: number;
  cloudId?: string;
  milkProfileId: number;
  entryDate: string;
  quantityMl: number;
  version?: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PriceHistory = {
  id: number;
  milkProfileId: number;
  pricePerLitrePaise: number;
  effectiveDate: string;
  createdAt: string;
};

export type QuantityHistory = {
  id: number;
  milkProfileId: number;
  defaultQuantityMl: number;
  effectiveDate: string;
  createdAt: string;
};

export type DailyMilkRecord = {
  date: string;
  quantityMl: number;
  pricePerLitrePaise: number;
  amountPaise: number;
  isModified: boolean;
  isSkipped: boolean;
  note: string | null;
};

export type MonthlySummary = {
  month: string;
  records: DailyMilkRecord[];
  totalQuantityMl: number;
  totalAmountPaise: number;
  skippedDays: number;
  modifiedDays: number;
  isMonthToDate: boolean;
};