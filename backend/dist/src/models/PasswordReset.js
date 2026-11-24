import { model, Schema } from 'mongoose';
const passwordResetSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date, default: null },
}, { timestamps: true });
export const PasswordReset = model('PasswordReset', passwordResetSchema);
