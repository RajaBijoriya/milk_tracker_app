import { model, Schema } from 'mongoose';
const legacyImportSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    milkProfileId: { type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true },
    importKey: { type: String, required: true },
    importedCount: { type: Number, required: true, min: 0 },
    historicalCount: { type: Number, required: true, min: 0 },
    completedAt: { type: Date, required: true },
}, { timestamps: true });
legacyImportSchema.index({ userId: 1, importKey: 1 }, { unique: true });
export const LegacyImport = model('LegacyImport', legacyImportSchema);
