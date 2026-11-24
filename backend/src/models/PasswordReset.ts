import {model, Schema, Types} from 'mongoose';

export interface PasswordResetRecord {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

const passwordResetSchema = new Schema<PasswordResetRecord>({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  tokenHash: {type: String, required: true, unique: true},
  expiresAt: {type: Date, required: true, index: {expireAfterSeconds: 0}},
  usedAt: {type: Date, default: null},
}, {timestamps: true});

export const PasswordReset = model<PasswordResetRecord>('PasswordReset', passwordResetSchema);
