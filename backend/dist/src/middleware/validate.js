import { HttpError } from '../utils/errors.js';
export function validate(part, schema) {
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
