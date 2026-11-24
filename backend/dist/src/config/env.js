import { z } from 'zod';
const durationPattern = /^\d+[smhd]$/;
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    ACCESS_TOKEN_EXPIRES_IN: z.string().regex(durationPattern).default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().regex(durationPattern).default('30d'),
    DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
    CORS_ORIGINS: z.string().default(''),
    PASSWORD_RESET_URL: z.string().url().optional().or(z.literal('')),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.string().default('false'),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    SMTP_FROM: z.string().optional().default(''),
}).superRefine((env, context) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
        context.addIssue({
            code: 'custom',
            message: 'Access and refresh token secrets must be different',
            path: ['JWT_REFRESH_SECRET'],
        });
    }
    const smtpValues = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_FROM];
    if (smtpValues.some(Boolean) && smtpValues.some(value => !value)) {
        context.addIssue({
            code: 'custom',
            message: 'SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured together',
            path: ['SMTP_HOST'],
        });
    }
    try {
        new Intl.DateTimeFormat('en', { timeZone: env.DEFAULT_TIMEZONE });
    }
    catch {
        context.addIssue({ code: 'custom', message: 'DEFAULT_TIMEZONE must be a valid IANA timezone', path: ['DEFAULT_TIMEZONE'] });
    }
});
export function parseEnv(environment = process.env) {
    return envSchema.parse(environment);
}
