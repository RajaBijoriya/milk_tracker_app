import {model, Schema, Types} from 'mongoose';

export interface PriceHistoryRecord {
  userId: Types.ObjectId;
  milkProfileId: Types.ObjectId;
  pricePerLitrePaise: number;
  effectiveDate: string;
}

const priceHistorySchema = new Schema<PriceHistoryRecord>({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  milkProfileId: {type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true},
  pricePerLitrePaise: {type: Number, required: true, min: 0, max: 100000000},
  effectiveDate: {type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/},
}, {timestamps: true});

priceHistorySchema.index({milkProfileId: 1, effectiveDate: 1}, {unique: true});

export const PriceHistory = model<PriceHistoryRecord>('MilkPriceHistory', priceHistorySchema);
