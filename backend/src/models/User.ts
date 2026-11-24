import {model, Schema, Types} from 'mongoose';

export interface UserRecord {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>({
  fullName: {type: String, required: true, trim: true, maxlength: 120},
  email: {type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254},
  passwordHash: {type: String, required: true, select: false},
  timezone: {type: String, required: true, default: 'Asia/Kolkata'},
}, {timestamps: true});

export const User = model<UserRecord>('User', userSchema);
