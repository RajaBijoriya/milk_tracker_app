import type {RequestHandler} from 'express';
import * as milkService from '../services/milkService.js';
import {
  entryDeleteSchema,
  entryUpsertSchema,
  importSchema,
  paramSchemas,
  paymentSchema,
  profileCreateSchema,
  profilePatchSchema,
} from '../validators/schemas.js';
import {z} from 'zod';

const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
const billingSummaryQuerySchema = z.object({
  month: z.string().optional().refine(value => value === undefined || /^\d{4}-(0[1-9]|1[0-2])$/.test(value), 'Use a valid YYYY-MM month'),
});
const paymentHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  month: z.string().optional().refine(value => value === undefined || /^\d{4}-(0[1-9]|1[0-2])$/.test(value), 'Use a valid YYYY-MM month'),
});
const importPreviewSchema = importSchema.omit({importKey: true, includeHistoricalReadOnly: true});

export const listProfiles: RequestHandler = async (request, response) => {
  response.json({success: true, data: {profiles: await milkService.listProfiles(request.auth!.userId)}});
};

export const getProfile: RequestHandler = async (request, response) => {
  const {id} = paramSchemas.profileId.parse(request.params);
  response.json({success: true, data: {profile: await milkService.getProfile(request.auth!.userId, id)}});
};

export const createProfile: RequestHandler = async (request, response) => {
  const input = profileCreateSchema.parse(request.body);
  const profile = await milkService.createProfile(request.auth!.userId, input);
  response.status(201).json({success: true, data: {profile}});
};

export const updateProfile: RequestHandler = async (request, response) => {
  const {id} = paramSchemas.profileId.parse(request.params);
  const input = profilePatchSchema.parse(request.body);
  const profile = await milkService.updateProfile(request.auth!.userId, id, input);
  response.json({success: true, data: {profile}});
};

export const listEntries: RequestHandler = async (request, response) => {
  const query = monthQuerySchema.parse(request.query);
  response.json({success: true, data: {entries: await milkService.listEntries(request.auth!.userId, query.month)}});
};

export const upsertEntry: RequestHandler = async (request, response) => {
  const {date} = paramSchemas.entryDate.parse(request.params);
  const input = entryUpsertSchema.parse(request.body);
  const entry = await milkService.upsertEntry(request.auth!.userId, date, input);
  response.json({success: true, data: {entry}});
};

export const deleteEntry: RequestHandler = async (request, response) => {
  const {date} = paramSchemas.entryDate.parse(request.params);
  const input = entryDeleteSchema.parse(request.body);
  response.json({success: true, data: await milkService.deleteEntry(request.auth!.userId, date, input.version)});
};

export const getStatement: RequestHandler = async (request, response) => {
  const {month} = paramSchemas.month.parse(request.params);
  response.json({success: true, data: {statement: await milkService.getStatement(request.auth!.userId, month)}});
};

export const getStatementQuery: RequestHandler = async (request, response) => {
  const {month} = monthQuerySchema.parse(request.query);
  response.json({success: true, data: {statement: await milkService.getStatement(request.auth!.userId, month)}});
};

export const getStatementHistory: RequestHandler = async (request, response) => {
  const pagination = paginationSchema.parse(request.query);
  response.json({success: true, data: await milkService.getStatementHistory(request.auth!.userId, pagination.page, pagination.limit)});
};

export const listBills: RequestHandler = async (request, response) => {
  const pagination = paginationSchema.parse(request.query);
  response.json({success: true, data: await milkService.listBills(request.auth!.userId, pagination.page, pagination.limit)});
};

export const getBillingSummary: RequestHandler = async (request, response) => {
  const query = billingSummaryQuerySchema.parse(request.query);
  response.json({success: true, data: {summary: await milkService.getBillingSummary(request.auth!.userId, query.month)}});
};

export const getBill: RequestHandler = async (request, response) => {
  const {month} = paramSchemas.month.parse(request.params);
  response.json({success: true, data: {bill: await milkService.getBillDetails(request.auth!.userId, month)}});
};

export const finalizeBill: RequestHandler = async (request, response) => {
  const {month} = paramSchemas.month.parse(request.params);
  const bill = await milkService.finalizeBill(request.auth!.userId, month);
  response.status(201).json({success: true, data: {bill}});
};

export const listPayments: RequestHandler = async (request, response) => {
  const query = paymentHistoryQuerySchema.parse(request.query);
  response.json({success: true, data: await milkService.listPayments(request.auth!.userId, query)});
};

export const recordPayment: RequestHandler = async (request, response) => {
  const input = paymentSchema.parse(request.body);
  const result = await milkService.recordPayment(request.auth!.userId, input);
  response.status(result.replayed ? 200 : 201).json({success: true, data: result});
};

export const previewImport: RequestHandler = async (request, response) => {
  const input = importPreviewSchema.parse(request.body);
  const preview = await milkService.previewLegacyImport(request.auth!.userId, input);
  response.json({success: true, data: {preview}});
};

export const commitImport: RequestHandler = async (request, response) => {
  const input = importSchema.parse(request.body);
  const result = await milkService.commitLegacyImport(request.auth!.userId, input);
  response.status(201).json({success: true, data: {import: result}});
};
