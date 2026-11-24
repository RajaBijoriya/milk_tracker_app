import {z} from 'zod';
import {isValidDateKey, isValidMonthKey} from '../utils/date.js';

const dateKey = z.string().refine(isValidDateKey, 'Use a valid YYYY-MM-DD date');
const monthKey = z.string().refine(isValidMonthKey, 'Use a valid YYYY-MM month');
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(12).max(128);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID');

export const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email,
  password,
  timezone: z.string().max(80).optional().refine(value => {
    if (!value) return true;
    try {
      new Intl.DateTimeFormat('en', {timeZone: value});
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid IANA timezone'),
  deviceName: z.string().trim().min(1).max(120),
  deviceId: z.string().trim().min(1).max(160),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  deviceName: z.string().trim().min(1).max(120),
  deviceId: z.string().trim().min(1).max(160),
});

export const refreshSchema = z.object({refreshToken: z.string().min(40).max(256)});
export const logoutSchema = refreshSchema;
export const forgotPasswordSchema = z.object({email});
export const resetPasswordSchema = z.object({
  token: z.string().min(40).max(256),
  password,
});
export const profileCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  defaultQuantityMl: z.number().int().min(0).max(100000),
  pricePerLitrePaise: z.number().int().min(0).max(100000000),
  startDate: dateKey,
});
export const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  defaultQuantityMl: z.number().int().min(0).max(100000).optional(),
  pricePerLitrePaise: z.number().int().min(0).max(100000000).optional(),
  startDate: dateKey.optional(),
  expectedStartDate: dateKey.optional(),
  quantityEffectiveDate: dateKey.optional(),
  priceEffectiveDate: dateKey.optional(),
}).refine(value => Object.keys(value).length > 0, 'At least one field is required')
  .refine(value => value.startDate === undefined || value.expectedStartDate !== undefined, {
    message: 'The current start date is required to safely update the tracking range',
    path: ['expectedStartDate'],
  })
  .refine(value => value.startDate !== undefined || value.expectedStartDate === undefined, {
    message: 'An expected start date must accompany a start-date update',
    path: ['expectedStartDate'],
  })
  .refine(value => value.defaultQuantityMl !== undefined || value.quantityEffectiveDate === undefined, {
    message: 'A quantity effective date requires a quantity change',
    path: ['quantityEffectiveDate'],
  })
  .refine(value => value.pricePerLitrePaise !== undefined || value.priceEffectiveDate === undefined, {
    message: 'A price effective date requires a price change',
    path: ['priceEffectiveDate'],
  });
export const entryUpsertSchema = z.object({
  quantityMl: z.number().int().min(0).max(100000),
  note: z.string().max(1000).optional().default(''),
  version: z.number().int().min(0),
});
export const entryDeleteSchema = z.object({version: z.number().int().min(1)});
export const importSchema = z.object({
  profile: profileCreateSchema,
  priceHistory: z.array(z.object({
    pricePerLitrePaise: z.number().int().min(0).max(100000000),
    effectiveDate: dateKey,
  })).max(200).default([]),
  quantityHistory: z.array(z.object({
    defaultQuantityMl: z.number().int().min(0).max(100000),
    effectiveDate: dateKey,
  })).max(200).default([]),
  entries: z.array(z.object({
    entryDate: dateKey,
    quantityMl: z.number().int().min(0).max(100000),
    note: z.string().max(1000).optional().default(''),
  })).max(2000).refine(entries => new Set(entries.map(entry => entry.entryDate)).size === entries.length, 'Import contains duplicate dates'),
  importKey: z.string().trim().min(16).max(128),
  includeHistoricalReadOnly: z.literal(true),
});

export const paramSchemas = {
  profileId: z.object({id: objectId}),
  entryDate: z.object({date: dateKey}),
  month: z.object({month: monthKey}),
};
