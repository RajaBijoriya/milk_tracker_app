import {model, Schema, Types} from 'mongoose';

export interface MilkProfileRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  defaultQuantityMl: number;
  pricePerLitrePaise: number;
  startDate: string;
  paymentRevision: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const milkProfileSchema = new Schema<MilkProfileRecord>({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  name: {type: String, required: true, trim: true, maxlength: 120},
  defaultQuantityMl: {type: Number, required: true, min: 0, max: 100000},
  pricePerLitrePaise: {type: Number, required: true, min: 0, max: 100000000},
  startDate: {type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/},
  paymentRevision: {type: Number, required: true, default: 0, min: 0},
  isActive: {type: Boolean, default: true, required: true},
}, {timestamps: true, optimisticConcurrency: true});

milkProfileSchema.index({userId: 1, isActive: 1}, {unique: true, partialFilterExpression: {isActive: true}});

export const MilkProfile = model<MilkProfileRecord>('MilkProfile', milkProfileSchema);
