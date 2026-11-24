import type {RequestHandler} from 'express';
import type {ZodType} from 'zod';
import {HttpError} from '../utils/errors.js';

type RequestPart = 'body' | 'query' | 'params';

export function validate(part: RequestPart, schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request[part]);
    if (!result.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', 'Check the submitted information.', result.error.issues));
      return;
    }
    request[part] = result.data;
    next();
  };
}
