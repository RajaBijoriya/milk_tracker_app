import * as milkService from '../services/milkService.js';
import { entryDeleteSchema, entryUpsertSchema, importSchema, paramSchemas, profileCreateSchema, profilePatchSchema, } from '../validators/schemas.js';
import { z } from 'zod';
const monthQuerySchema = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24),
});
const importPreviewSchema = importSchema.omit({ importKey: true, includeHistoricalReadOnly: true });
export const listProfiles = async (request, response) => {
    response.json({ success: true, data: { profiles: await milkService.listProfiles(request.auth.userId) } });
};
export const getProfile = async (request, response) => {
    const { id } = paramSchemas.profileId.parse(request.params);
    response.json({ success: true, data: { profile: await milkService.getProfile(request.auth.userId, id) } });
};
export const createProfile = async (request, response) => {
    const input = profileCreateSchema.parse(request.body);
    const profile = await milkService.createProfile(request.auth.userId, input);
    response.status(201).json({ success: true, data: { profile } });
};
export const updateProfile = async (request, response) => {
    const { id } = paramSchemas.profileId.parse(request.params);
    const input = profilePatchSchema.parse(request.body);
    const profile = await milkService.updateProfile(request.auth.userId, id, input);
    response.json({ success: true, data: { profile } });
};
export const listEntries = async (request, response) => {
    const query = monthQuerySchema.parse(request.query);
    response.json({ success: true, data: { entries: await milkService.listEntries(request.auth.userId, query.month) } });
};
export const upsertEntry = async (request, response) => {
    const { date } = paramSchemas.entryDate.parse(request.params);
    const input = entryUpsertSchema.parse(request.body);
    const entry = await milkService.upsertEntry(request.auth.userId, date, input);
    response.json({ success: true, data: { entry } });
};
export const deleteEntry = async (request, response) => {
    const { date } = paramSchemas.entryDate.parse(request.params);
    const input = entryDeleteSchema.parse(request.body);
    response.json({ success: true, data: await milkService.deleteEntry(request.auth.userId, date, input.version) });
};
export const getStatement = async (request, response) => {
    const { month } = paramSchemas.month.parse(request.params);
    response.json({ success: true, data: { statement: await milkService.getStatement(request.auth.userId, month) } });
};
export const getStatementQuery = async (request, response) => {
    const { month } = monthQuerySchema.parse(request.query);
    response.json({ success: true, data: { statement: await milkService.getStatement(request.auth.userId, month) } });
};
export const getStatementHistory = async (request, response) => {
    const pagination = paginationSchema.parse(request.query);
    response.json({ success: true, data: await milkService.getStatementHistory(request.auth.userId, pagination.page, pagination.limit) });
};
export const listBills = async (request, response) => {
    const pagination = paginationSchema.parse(request.query);
    response.json({ success: true, data: await milkService.listBills(request.auth.userId, pagination.page, pagination.limit) });
};
export const getBill = async (request, response) => {
    const { month } = paramSchemas.month.parse(request.params);
    const statement = await milkService.getStatement(request.auth.userId, month);
    response.json({ success: true, data: { bill: statement } });
};
export const finalizeBill = async (request, response) => {
    const { month } = paramSchemas.month.parse(request.params);
    const bill = await milkService.finalizeBill(request.auth.userId, month);
    response.status(201).json({ success: true, data: { bill } });
};
export const previewImport = async (request, response) => {
    const input = importPreviewSchema.parse(request.body);
    const preview = await milkService.previewLegacyImport(request.auth.userId, input);
    response.json({ success: true, data: { preview } });
};
export const commitImport = async (request, response) => {
    const input = importSchema.parse(request.body);
    const result = await milkService.commitLegacyImport(request.auth.userId, input);
    response.status(201).json({ success: true, data: { import: result } });
};
