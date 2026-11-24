import type {Request, RequestHandler} from 'express';
import * as authService from '../services/authService.js';
import type {AppConfig} from '../config/env.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  paramSchemas,
} from '../validators/schemas.js';

function config(request: Request): AppConfig {
  return request.app.locals.config as AppConfig;
}

export const register: RequestHandler = async (request, response) => {
  const input = registerSchema.parse(request.body);
  const result = await authService.register(
    input,
    config(request),
    input.deviceName,
    input.deviceId,
  );
  response.status(201).json({success: true, data: result});
};

export const login: RequestHandler = async (request, response) => {
  const input = loginSchema.parse(request.body);
  const result = await authService.login(
    input.email,
    input.password,
    input.deviceName,
    input.deviceId,
    config(request),
  );
  response.json({success: true, data: result});
};

export const refresh: RequestHandler = async (request, response) => {
  const input = refreshSchema.parse(request.body);
  response.json({success: true, data: await authService.refresh(input.refreshToken, config(request))});
};

export const logout: RequestHandler = async (request, response) => {
  const identity = request.auth!;
  await authService.revokeCurrentSession(identity.userId, identity.sessionId);
  response.json({success: true, data: {loggedOut: true}});
};

export const logoutAll: RequestHandler = async (request, response) => {
  await authService.revokeAllSessions(request.auth!.userId);
  response.json({success: true, data: {loggedOut: true}});
};

export const me: RequestHandler = async (request, response) => {
  response.json({success: true, data: {user: await authService.getCurrentUser(request.auth!.userId)}});
};

export const sessions: RequestHandler = async (request, response) => {
  response.json({success: true, data: {sessions: await authService.getSessions(request.auth!.userId)}});
};

export const revokeSession: RequestHandler = async (request, response) => {
  const {id} = paramSchemas.profileId.parse(request.params);
  await authService.revokeSession(request.auth!.userId, id);
  response.json({success: true, data: {revoked: true}});
};

export const forgotPassword: RequestHandler = async (request, response) => {
  const input = forgotPasswordSchema.parse(request.body);
  await authService.requestPasswordReset(input.email, config(request));
  response.json({success: true, data: {message: 'If the account exists, password reset instructions have been sent.'}});
};

export const resetPassword: RequestHandler = async (request, response) => {
  const input = resetPasswordSchema.parse(request.body);
  await authService.resetPassword(input.token, input.password, config(request));
  response.json({success: true, data: {passwordReset: true}});
};
