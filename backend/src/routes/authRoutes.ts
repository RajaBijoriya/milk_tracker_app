import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import * as controller from '../controllers/authController.js';
import {authenticate} from '../middleware/authenticate.js';
import {validate} from '../middleware/validate.js';
import {paramSchemas} from '../validators/schemas.js';

const authRouter = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: request => request.app.locals.config.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({success: false, error: {code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.'}});
  },
});
const resetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: request => request.app.locals.config.NODE_ENV === 'test' ? 1000 : 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({success: false, error: {code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.'}});
  },
});

authRouter.post('/register', loginLimiter, controller.register);
authRouter.post('/login', loginLimiter, controller.login);
authRouter.post('/refresh', loginLimiter, controller.refresh);
authRouter.post('/forgot-password', resetLimiter, controller.forgotPassword);
authRouter.post('/reset-password', resetLimiter, controller.resetPassword);
authRouter.get('/me', authenticate, controller.me);
authRouter.post('/logout', authenticate, controller.logout);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
authRouter.get('/sessions', authenticate, controller.sessions);
authRouter.delete('/sessions/:id', authenticate, validate('params', paramSchemas.profileId), controller.revokeSession);

export default authRouter;
