import { hash as hashPassword, verify as verifyPassword } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { PasswordReset, Session, User } from '../models/index.js';
import { createOpaqueToken, durationMilliseconds, hashToken } from '../utils/crypto.js';
import { HttpError } from '../utils/errors.js';
const ACCESS_ISSUER = 'milktracker-api';
const ACCESS_AUDIENCE = 'milktracker-mobile';
function publicUser(user) {
    return { id: user.id, fullName: user.fullName, email: user.email, timezone: user.timezone };
}
async function createAccessToken(userId, sessionId, config) {
    return new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ACCESS_ISSUER)
        .setAudience(ACCESS_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(config.ACCESS_TOKEN_EXPIRES_IN)
        .sign(new TextEncoder().encode(config.JWT_ACCESS_SECRET));
}
async function issueSessionTokens(userId, sessionId, refreshToken, config) {
    return {
        accessToken: await createAccessToken(userId, sessionId, config),
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: durationMilliseconds(config.ACCESS_TOKEN_EXPIRES_IN) / 1000,
    };
}
function refreshHash(token, config) {
    return hashToken(token, config.JWT_REFRESH_SECRET);
}
async function createSession(userId, deviceName, deviceId, config) {
    const rawToken = createOpaqueToken();
    const now = new Date();
    const session = await Session.create({
        userId,
        deviceName,
        deviceId,
        refreshTokenHash: refreshHash(rawToken, config),
        usedRefreshTokenHashes: [],
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + durationMilliseconds(config.REFRESH_TOKEN_EXPIRES_IN)),
        revokedAt: null,
    });
    return {
        session,
        tokens: await issueSessionTokens(userId, session.id, rawToken, config),
    };
}
export async function register(input, config, deviceName, deviceId) {
    const timezone = input.timezone ?? config.DEFAULT_TIMEZONE;
    const session = await mongoose.startSession();
    let created;
    try {
        created = await session.withTransaction(async () => {
            const passwordHash = await hashPassword(input.password, {
                algorithm: 2 /* Algorithm.Argon2id */,
                memoryCost: 19_456,
                timeCost: 2,
                parallelism: 1,
                outputLen: 32,
            });
            const [user] = await User.create([{
                    fullName: input.fullName.trim(),
                    email: input.email.trim().toLowerCase(),
                    passwordHash,
                    timezone,
                }], { session });
            const rawToken = createOpaqueToken();
            const now = new Date();
            const [deviceSession] = await Session.create([{
                    userId: user.id,
                    deviceName,
                    deviceId,
                    refreshTokenHash: refreshHash(rawToken, config),
                    usedRefreshTokenHashes: [],
                    lastUsedAt: now,
                    expiresAt: new Date(now.getTime() + durationMilliseconds(config.REFRESH_TOKEN_EXPIRES_IN)),
                    revokedAt: null,
                }], { session });
            return {
                user,
                tokens: await issueSessionTokens(user.id, deviceSession.id, rawToken, config),
            };
        });
    }
    finally {
        await session.endSession();
    }
    if (!created)
        throw new HttpError(500, 'REGISTRATION_FAILED', 'Unable to create the account.');
    return { user: publicUser(created.user), ...created.tokens };
}
export async function login(email, password, deviceName, deviceId, config) {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const issued = await createSession(user.id, deviceName, deviceId, config);
    return { user: publicUser(user), ...issued.tokens };
}
export async function refresh(rawToken, config) {
    const hash = refreshHash(rawToken, config);
    const session = await Session.findOne({
        $or: [{ refreshTokenHash: hash }, { usedRefreshTokenHashes: hash }],
    }).select('+refreshTokenHash +usedRefreshTokenHashes');
    if (!session)
        throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Sign in again to continue.');
    if (session.revokedAt)
        throw new HttpError(401, 'SESSION_REVOKED', 'This device session has been signed out.');
    if (session.expiresAt <= new Date()) {
        session.revokedAt = new Date();
        await session.save();
        throw new HttpError(401, 'SESSION_EXPIRED', 'Sign in again to continue.');
    }
    if (session.usedRefreshTokenHashes.includes(hash)) {
        session.revokedAt = new Date();
        await session.save();
        throw new HttpError(401, 'REFRESH_TOKEN_REUSE', 'This device session was revoked. Sign in again.');
    }
    const user = await User.findById(session.userId);
    if (!user) {
        session.revokedAt = new Date();
        await session.save();
        throw new HttpError(401, 'SESSION_INVALID', 'Sign in again to continue.');
    }
    const nextRawToken = createOpaqueToken();
    const nextHash = refreshHash(nextRawToken, config);
    const now = new Date();
    const rotated = await Session.findOneAndUpdate({ _id: session.id, refreshTokenHash: hash, revokedAt: null, expiresAt: { $gt: now } }, {
        $set: { refreshTokenHash: nextHash, lastUsedAt: now },
        $push: { usedRefreshTokenHashes: hash },
    }, { returnDocument: 'after' });
    if (!rotated) {
        const reused = await Session.findOne({ _id: session.id, usedRefreshTokenHashes: hash })
            .select('+usedRefreshTokenHashes');
        if (reused && !reused.revokedAt) {
            reused.revokedAt = now;
            await reused.save();
            throw new HttpError(401, 'REFRESH_TOKEN_REUSE', 'This device session was revoked. Sign in again.');
        }
        throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Sign in again to continue.');
    }
    return {
        user: publicUser(user),
        ...(await issueSessionTokens(user.id, rotated.id, nextRawToken, config)),
    };
}
export async function revokeCurrentSession(userId, sessionId) {
    await Session.updateOne({ userId, _id: sessionId, revokedAt: null }, { revokedAt: new Date() });
}
export async function revokeAllSessions(userId) {
    await Session.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}
export async function getSessions(userId) {
    return Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
        .select('deviceName deviceId createdAt lastUsedAt expiresAt')
        .sort({ lastUsedAt: -1 })
        .lean();
}
export async function revokeSession(userId, sessionId) {
    const session = await Session.findOneAndUpdate({ _id: sessionId, userId, revokedAt: null }, { revokedAt: new Date() });
    if (!session)
        throw new HttpError(404, 'SESSION_NOT_FOUND', 'The active device session was not found.');
}
export async function getCurrentUser(userId) {
    const user = await User.findById(userId);
    if (!user)
        throw new HttpError(401, 'SESSION_INVALID', 'Sign in again to continue.');
    return publicUser(user);
}
export async function requestPasswordReset(email, config) {
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD || !config.SMTP_FROM || !config.PASSWORD_RESET_URL) {
        throw new HttpError(503, 'PASSWORD_RESET_UNAVAILABLE', 'Password reset is unavailable until email delivery is configured.');
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user)
        return;
    const rawToken = createOpaqueToken();
    const tokenHash = refreshHash(rawToken, config);
    await PasswordReset.updateMany({ userId: user.id, usedAt: null }, { usedAt: new Date() });
    await PasswordReset.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        usedAt: null,
    });
    const transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE === 'true',
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    });
    const url = new URL(config.PASSWORD_RESET_URL);
    url.searchParams.set('token', rawToken);
    await transporter.sendMail({
        from: config.SMTP_FROM,
        to: user.email,
        subject: 'Reset your MilkTracker password',
        text: `Use this one-time link within 30 minutes to reset your password: ${url.toString()}`,
    });
}
export async function resetPassword(rawToken, password, config) {
    const tokenHash = refreshHash(rawToken, config);
    const reset = await PasswordReset.findOne({
        tokenHash,
        usedAt: null,
        expiresAt: { $gt: new Date() },
    });
    if (!reset)
        throw new HttpError(400, 'INVALID_RESET_TOKEN', 'This password reset link is invalid or expired.');
    const passwordHash = await hashPassword(password, {
        algorithm: 2 /* Algorithm.Argon2id */,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
        outputLen: 32,
    });
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const consumed = await PasswordReset.findOneAndUpdate({ _id: reset.id, usedAt: null, expiresAt: { $gt: new Date() } }, { usedAt: new Date() }, { session });
            if (!consumed)
                throw new HttpError(400, 'INVALID_RESET_TOKEN', 'This password reset link is invalid or expired.');
            await User.updateOne({ _id: reset.userId }, { passwordHash }, { session });
            await Session.updateMany({ userId: reset.userId, revokedAt: null }, { revokedAt: new Date() }, { session });
            await PasswordReset.updateMany({ userId: reset.userId, _id: { $ne: reset.id }, usedAt: null }, { usedAt: new Date() }, { session });
        });
    }
    finally {
        await session.endSession();
    }
}
export async function verifyAccessToken(token, config) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.JWT_ACCESS_SECRET), {
        issuer: ACCESS_ISSUER,
        audience: ACCESS_AUDIENCE,
        algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new HttpError(401, 'INVALID_ACCESS_TOKEN', 'Sign in again to continue.');
    }
    return { userId: payload.sub, sessionId: payload.sid };
}
