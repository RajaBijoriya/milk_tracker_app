import {model, Schema, Types} from 'mongoose';

export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export interface PaymentAllocation {
  billMonth: string;
  amountPaise: number;
}

export interface MilkPaymentRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  milkProfileId: Types.ObjectId;
  idempotencyKey: string;
  requestFingerprint: string;
  amountPaise: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  allocations: PaymentAllocation[];
  createdAt: Date;
  updatedAt: Date;
}

const allocationSchema = new Schema<PaymentAllocation>({
  billMonth: {type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/},
  amountPaise: {type: Number, required: true, min: 1},
}, {_id: false});

const milkPaymentSchema = new Schema<MilkPaymentRecord>({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  milkProfileId: {type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true},
  idempotencyKey: {type: String, required: true, minlength: 16, maxlength: 128},
  requestFingerprint: {type: String, required: true, minlength: 64, maxlength: 64},
  amountPaise: {type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER},
  paymentDate: {type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/},
  paymentMethod: {type: String, enum: ['cash', 'upi', 'bank_transfer', 'other'], required: true},
  note: {type: String, default: '', maxlength: 500},
  allocations: {type: [allocationSchema], required: true, validate: {
    validator: (allocations: PaymentAllocation[]) =>
      allocations.length > 0 && allocations.every(allocation => Number.isSafeInteger(allocation.amountPaise) && allocation.amountPaise > 0),
    message: 'A payment must have positive bill allocations.',
  }},
}, {timestamps: true});

milkPaymentSchema.index({userId: 1, idempotencyKey: 1}, {unique: true});
milkPaymentSchema.index({userId: 1, milkProfileId: 1, paymentDate: -1});
milkPaymentSchema.index({milkProfileId: 1, 'allocations.billMonth': 1});

export const MilkPayment = model<MilkPaymentRecord>('MilkPayment', milkPaymentSchema);
