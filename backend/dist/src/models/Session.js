import { model, Schema } from 'mongoose';
const sessionSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceName: { type: String, required: true, maxlength: 120 },
    deviceId: { type: String, required: true, maxlength: 160 },
    refreshTokenHash: { type: String, required: true, unique: true, select: false },
    usedRefreshTokenHashes: { type: [String], default: [], select: false },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
sessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
export const Session = model('Session', sessionSchema);
