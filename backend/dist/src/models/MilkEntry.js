import { model, Schema } from 'mongoose';
const milkEntrySchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    milkProfileId: { type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true },
    entryDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    quantityMl: { type: Number, required: true, min: 0, max: 100000 },
    note: { type: String, default: '', maxlength: 1000 },
    version: { type: Number, required: true, default: 1, min: 1 },
    isLegacyImported: { type: Boolean, default: false },
}, { timestamps: true });
milkEntrySchema.index({ milkProfileId: 1, entryDate: 1 }, { unique: true });
milkEntrySchema.index({ userId: 1, entryDate: 1 });
export const MilkEntry = model('MilkEntry', milkEntrySchema);
