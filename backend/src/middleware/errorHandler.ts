import type {ErrorRequestHandler, RequestHandler} from 'express';
import {ZodError} from 'zod';
import {HttpError} from '../utils/errors.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  let httpError = error instanceof HttpError ? error : null;
  if (error instanceof ZodError) {
    httpError = new HttpError(400, 'VALIDATION_ERROR', 'Check the submitted information.', error.issues);
  } else if (error?.code === 11000) {
    httpError = new HttpError(409, 'DUPLICATE_RESOURCE', 'That record already exists.');
  } else if (error?.name === 'CastError') {
    httpError = new HttpError(400, 'INVALID_RESOURCE_ID', 'The requested resource ID is invalid.');
  } else if (error?.name === 'ValidationError') {
    httpError = new HttpError(400, 'VALIDATION_ERROR', 'Check the submitted information.');
  } else if (error?.type === 'entity.parse.failed') {
    httpError = new HttpError(400, 'INVALID_JSON', 'The request body must be valid JSON.');
  }

  const status = httpError?.status ?? 500;
  const code = httpError?.code ?? 'INTERNAL_ERROR';
  const message = httpError?.message ?? 'An unexpected server error occurred.';
  if (status >= 500) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'request_failed',
      requestId: response.locals.requestId,
      path: request.path,
      method: request.method,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorCode: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
    }));
  }
  response.status(status).json({
    success: false,
    error: {code, message, ...(httpError?.details ? {details: httpError.details} : {})},
  });
};
