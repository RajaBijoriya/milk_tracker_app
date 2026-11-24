import {model, Schema, Types} from 'mongoose';

export interface LegacyImportRecord {
  userId: Types.ObjectId;
  milkProfileId: Types.ObjectId;
  importKey: string;
  importedCount: number;
  historicalCount: number;
  completedAt: Date;
}

const legacyImportSchema = new Schema<LegacyImportRecord>({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  milkProfileId: {type: Schema.Types.ObjectId, ref: 'MilkProfile', required: true},
  importKey: {type: String, required: true},
  importedCount: {type: Number, required: true, min: 0},
  historicalCount: {type: Number, required: true, min: 0},
  completedAt: {type: Date, required: true},
}, {timestamps: true});

legacyImportSchema.index({userId: 1, importKey: 1}, {unique: true});

export const LegacyImport = model<LegacyImportRecord>('LegacyImport', legacyImportSchema);
