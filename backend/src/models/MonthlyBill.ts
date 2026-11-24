import {model, Schema, Types} from 'mongoose';

export interface MonthlyBillRecord {
  userId: Types.ObjectId;
  milkProfileId: Types.ObjectId;
  billMonth: string;
  totalQuantityMl: number;
  totalAmountPaise: number;
  status: 'provisional' | 'finalized';
  generatedAt: Date;
  finalizedAt: Date | null;
  snapshot: unknown | null;
}

const monthlyBillSchema = new Schema<MonthlyBillRecord>({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  milkProfileId: {type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true},
  billMonth: {type: String, required: true, match: /^\d{4}-\d{2}$/},
  totalQuantityMl: {type: Number, required: true, min: 0},
  totalAmountPaise: {type: Number, required: true, min: 0},
  status: {type: String, enum: ['provisional', 'finalized'], default: 'provisional'},
  generatedAt: {type: Date, required: true},
  finalizedAt: {type: Date, default: null},
  snapshot: {type: Schema.Types.Mixed, default: null},
}, {timestamps: true});

monthlyBillSchema.index({milkProfileId: 1, billMonth: 1}, {unique: true});
monthlyBillSchema.index({userId: 1, billMonth: -1});

export const MonthlyBill = model<MonthlyBillRecord>('MonthlyBill', monthlyBillSchema);
