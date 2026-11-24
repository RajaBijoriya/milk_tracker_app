import { model, Schema } from 'mongoose';
const userSchema = new Schema({
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
}, { timestamps: true });
export const User = model('User', userSchema);
