import { model, Schema } from 'mongoose';
const milkProfileSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    defaultQuantityMl: { type: Number, required: true, min: 0, max: 100000 },
    pricePerLitrePaise: { type: Number, required: true, min: 0, max: 100000000 },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    isActive: { type: Boolean, default: true, required: true },
}, { timestamps: true, optimisticConcurrency: true });
milkProfileSchema.index({ userId: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
export const MilkProfile = model('MilkProfile', milkProfileSchema);
