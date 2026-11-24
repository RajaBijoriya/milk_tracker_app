import { createHmac, randomBytes } from 'node:crypto';
export function createOpaqueToken() {
    return randomBytes(48).toString('base64url');
}
export function hashToken(token, secret) {
    return createHmac('sha256', secret).update(token).digest('hex');
}
export function durationMilliseconds(duration) {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match)
        throw new Error('Invalid configured duration');
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return amount * multiplier;
}
