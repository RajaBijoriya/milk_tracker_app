import { model, Schema } from 'mongoose';
const monthlyBillSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    milkProfileId: { type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true },
    billMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    totalQuantityMl: { type: Number, required: true, min: 0 },
    totalAmountPaise: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['provisional', 'finalized'], default: 'provisional' },
    generatedAt: { type: Date, required: true },
    finalizedAt: { type: Date, default: null },
    snapshot: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true });
monthlyBillSchema.index({ milkProfileId: 1, billMonth: 1 }, { unique: true });
monthlyBillSchema.index({ userId: 1, billMonth: -1 });
export const MonthlyBill = model('MonthlyBill', monthlyBillSchema);
