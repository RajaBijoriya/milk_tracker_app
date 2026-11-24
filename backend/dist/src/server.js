import 'dotenv/config';
import mongoose from 'mongoose';
import { parseEnv } from './config/env.js';
import { createApp } from './app.js';
import * as models from './models/index.js';
const config = parseEnv();
await mongoose.connect(config.MONGODB_URI, {
    autoIndex: config.NODE_ENV !== 'production',
});
if (config.NODE_ENV === 'production') {
    await Promise.all(Object.values(models).map(model => model.createIndexes()));
}
const app = createApp(config);
const server = app.listen(config.PORT, () => {
    console.info(JSON.stringify({ level: 'info', event: 'server_started', port: config.PORT, environment: config.NODE_ENV }));
});
async function shutdown(signal) {
    console.info(JSON.stringify({ level: 'info', event: 'server_shutdown', signal }));
    server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
    });
}
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
