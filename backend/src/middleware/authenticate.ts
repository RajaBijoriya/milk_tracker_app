import type {RequestHandler} from 'express';
import {Session} from '../models/index.js';
import {verifyAccessToken} from '../services/authService.js';
import {HttpError} from '../utils/errors.js';

export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const authorization = request.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
    }
    const config = request.app.locals.config;
    const identity = await verifyAccessToken(authorization.slice(7), config);
    const session = await Session.findOne({
      _id: identity.sessionId,
      userId: identity.userId,
      revokedAt: null,
      expiresAt: {$gt: new Date()},
    }).select('_id');
    if (!session) throw new HttpError(401, 'SESSION_REVOKED', 'This device session is no longer active.');
    request.auth = identity;
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    if (error instanceof Error && (error.name === 'JWTExpired' || error.name === 'JWSSignatureVerificationFailed' || error.name === 'JWTClaimValidationFailed' || error.name === 'JWSInvalid')) {
      next(new HttpError(401, 'INVALID_ACCESS_TOKEN', 'Sign in again to continue.'));
      return;
    }
    next(error);
  }
};
