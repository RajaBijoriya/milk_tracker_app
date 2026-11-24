import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { HttpError } from './utils/errors.js';
import authRouter from './routes/authRoutes.js';
import milkRouter from './routes/milkRoutes.js';
export function createApp(config) {
    const app = express();
    app.locals.config = config;
    app.disable('x-powered-by');
    if (config.NODE_ENV === 'production') {
        app.set('trust proxy', 1);
        app.use((request, _response, next) => {
            if (!request.secure) {
                next(new HttpError(426, 'HTTPS_REQUIRED', 'Use HTTPS to access MilkTracker.'));
                return;
            }
            next();
        });
    }
    app.use(helmet());
    const allowedOrigins = config.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean);
    app.use(cors({
        origin(origin, callback) {
            if (!origin || config.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new HttpError(403, 'CORS_ORIGIN_DENIED', 'This origin is not allowed.'));
        },
        credentials: false,
    }));
    app.use(express.json({ limit: '1mb' }));
    app.use((request, response, next) => {
        const requestId = crypto.randomUUID();
        response.locals.requestId = requestId;
        response.setHeader('x-request-id', requestId);
        const startedAt = Date.now();
        response.on('finish', () => {
            console.info(JSON.stringify({
                level: 'info',
                event: 'request_completed',
                requestId,
                method: request.method,
                path: request.path,
                status: response.statusCode,
                durationMs: Date.now() - startedAt,
            }));
        });
        next();
    });
    app.get('/health', (_request, response) => {
        response.json({ success: true, data: { status: 'ok' } });
    });
    app.use('/api/v1/auth', authRouter);
    app.use('/api/v1/milk', milkRouter);
    app.use(notFound);
    app.use(errorHandler);
    return app;
}
