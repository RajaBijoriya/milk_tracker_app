import { model, Schema } from 'mongoose';
const quantityHistorySchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    milkProfileId: { type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true },
    defaultQuantityMl: { type: Number, required: true, min: 0, max: 100000 },
    effectiveDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
}, { timestamps: true });
quantityHistorySchema.index({ milkProfileId: 1, effectiveDate: 1 }, { unique: true });
export const QuantityHistory = model('MilkQuantityHistory', quantityHistorySchema);
