import {model, Schema, Types} from 'mongoose';

export interface SessionRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  deviceName: string;
  deviceId: string;
  refreshTokenHash: string;
  usedRefreshTokenHashes: string[];
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

const sessionSchema = new Schema<SessionRecord>({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  deviceName: {type: String, required: true, maxlength: 120},
  deviceId: {type: String, required: true, maxlength: 160},
  refreshTokenHash: {type: String, required: true, unique: true, select: false},
  usedRefreshTokenHashes: {type: [String], default: [], select: false},
  lastUsedAt: {type: Date, required: true},
  expiresAt: {type: Date, required: true, index: {expireAfterSeconds: 0}},
  revokedAt: {type: Date, default: null},
}, {timestamps: {createdAt: true, updatedAt: false}});

sessionSchema.index({userId: 1, revokedAt: 1, expiresAt: 1});

export const Session = model<SessionRecord>('Session', sessionSchema);
