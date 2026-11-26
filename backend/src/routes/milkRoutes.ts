import {Router} from 'express';
import {authenticate} from '../middleware/authenticate.js';
import {validate} from '../middleware/validate.js';
import * as controller from '../controllers/milkController.js';
import {paramSchemas, paymentSchema, profileCreateSchema, profilePatchSchema} from '../validators/schemas.js';

const milkRouter = Router();
milkRouter.use(authenticate);

milkRouter.get('/profiles', controller.listProfiles);
milkRouter.post('/profiles', validate('body', profileCreateSchema), controller.createProfile);
milkRouter.get('/profiles/:id', validate('params', paramSchemas.profileId), controller.getProfile);
milkRouter.patch('/profiles/:id', validate('params', paramSchemas.profileId), validate('body', profilePatchSchema), controller.updateProfile);

milkRouter.get('/entries', controller.listEntries);
milkRouter.put('/entries/:date', validate('params', paramSchemas.entryDate), controller.upsertEntry);
milkRouter.delete('/entries/:date', validate('params', paramSchemas.entryDate), controller.deleteEntry);

milkRouter.post('/import/preview', controller.previewImport);
milkRouter.post('/import/commit', controller.commitImport);

milkRouter.get('/statements/history', controller.getStatementHistory);
milkRouter.get('/statements', controller.getStatementQuery);
milkRouter.get('/statements/:month', validate('params', paramSchemas.month), controller.getStatement);

milkRouter.get('/bills/summary', controller.getBillingSummary);
milkRouter.get('/bills', controller.listBills);
milkRouter.get('/bills/:month', validate('params', paramSchemas.month), controller.getBill);
milkRouter.post('/bills/:month/finalize', validate('params', paramSchemas.month), controller.finalizeBill);
milkRouter.get('/payments', controller.listPayments);
milkRouter.post('/payments', validate('body', paymentSchema), controller.recordPayment);

export default milkRouter;
