import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import * as models from '../src/models/index.js';
import { dateKeyAt, startDateRangeAt } from '../src/utils/date.js';
const config = parseEnv({
    NODE_ENV: 'test',
    PORT: '4000',
    MONGODB_URI: 'mongodb://127.0.0.1/test',
    JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-123',
    JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-456',
    ACCESS_TOKEN_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '30d',
    DEFAULT_TIMEZONE: 'Asia/Kolkata',
    CORS_ORIGINS: '',
    PASSWORD_RESET_URL: '',
    SMTP_HOST: '',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMTP_FROM: '',
});
const app = createApp(config);
let mongo;
before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri());
    await Promise.all(Object.values(models).map(model => model.init()));
});
after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});
let sequence = 0;
function credentials() {
    sequence += 1;
    return {
        fullName: 'Milk Test',
        email: `test-${sequence}@example.com`,
        password: 'a-secure-test-password',
        deviceName: 'Android test device',
        deviceId: `test-device-${sequence}`,
    };
}
async function registerAccount(input = credentials()) {
    const response = await request(app).post('/api/v1/auth/register').send(input);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return { input, data: response.body.data };
}
function authorized(token) {
    return { Authorization: `Bearer ${token}` };
}
test('registers with Argon2id, logs in on independent devices, and rotates refresh tokens', async () => {
    const { input, data } = await registerAccount();
    const user = await models.User.findById(data.user.id).select('+passwordHash');
    assert.ok(user?.passwordHash.startsWith('$argon2id$'));
    const secondLogin = await request(app).post('/api/v1/auth/login').send({
        email: input.email,
        password: input.password,
        deviceName: 'Second Android',
        deviceId: 'second-device',
    });
    assert.equal(secondLogin.status, 200);
    const sessions = await request(app).get('/api/v1/auth/sessions').set(authorized(data.accessToken));
    assert.equal(sessions.body.data.sessions.length, 2);
    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: data.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.data.refreshToken, data.refreshToken);
    const reused = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: data.refreshToken });
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, 'REFRESH_TOKEN_REUSE');
    const revokedAccess = await request(app).get('/api/v1/auth/me').set(authorized(data.accessToken));
    assert.equal(revokedAccess.status, 401);
});
test('rejects invalid credentials, keeps email normalized, and reports unavailable password reset', async () => {
    const input = { ...credentials(), email: `  User${sequence + 1}@Example.COM  ` };
    const { data } = await registerAccount(input);
    assert.equal(data.user.email, input.email.trim().toLowerCase());
    const invalid = await request(app).post('/api/v1/auth/login').send({
        email: data.user.email,
        password: 'wrong-password',
        deviceName: 'Android',
        deviceId: 'invalid-device',
    });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, 'INVALID_CREDENTIALS');
    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: data.user.email });
    assert.equal(forgot.status, 503);
    assert.equal(forgot.body.error.code, 'PASSWORD_RESET_UNAVAILABLE');
});
test('enforces user isolation, the edit window, future-date rejection, and optimistic versions', async () => {
    const { data: first } = await registerAccount();
    const { data: second } = await registerAccount();
    const today = dateKeyAt(new Date(), 'Asia/Kolkata');
    const profileResponse = await request(app)
        .post('/api/v1/milk/profiles')
        .set(authorized(first.accessToken))
        .send({ name: 'Home', defaultQuantityMl: 1500, pricePerLitrePaise: 8000, startDate: today });
    assert.equal(profileResponse.status, 201, JSON.stringify(profileResponse.body));
    const profileId = profileResponse.body.data.profile.id;
    const write = await request(app)
        .put(`/api/v1/milk/entries/${today}`)
        .set(authorized(first.accessToken))
        .send({ quantityMl: 1000, version: 0 });
    assert.equal(write.status, 200);
    assert.equal(write.body.data.entry.version, 1);
    const update = await request(app)
        .put(`/api/v1/milk/entries/${today}`)
        .set(authorized(first.accessToken))
        .send({ quantityMl: 1250, version: 1 });
    assert.equal(update.body.data.entry.version, 2);
    const stale = await request(app)
        .put(`/api/v1/milk/entries/${today}`)
        .set(authorized(first.accessToken))
        .send({ quantityMl: 500, version: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'VERSION_CONFLICT');
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 3);
    const oldDateKey = dateKeyAt(oldDate, 'Asia/Kolkata');
    const locked = await request(app)
        .put(`/api/v1/milk/entries/${oldDateKey}`)
        .set(authorized(first.accessToken))
        .send({ quantityMl: 1000, version: 0 });
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error.code, 'EDIT_WINDOW_EXPIRED');
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const futureDateKey = dateKeyAt(future, 'Asia/Kolkata');
    const futureWrite = await request(app)
        .put(`/api/v1/milk/entries/${futureDateKey}`)
        .set(authorized(first.accessToken))
        .send({ quantityMl: 1000, version: 0 });
    assert.equal(futureWrite.status, 403);
    const foreignProfile = await request(app)
        .get(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(second.accessToken));
    assert.equal(foreignProfile.status, 404);
    const foreignList = await request(app)
        .get('/api/v1/milk/profiles')
        .set(authorized(second.accessToken));
    assert.deepEqual(foreignList.body.data.profiles, []);
});
test('serves historical statements and keeps finalized snapshots immutable', async () => {
    const { data } = await registerAccount();
    const user = await models.User.findById(data.user.id);
    assert.ok(user);
    const oldStart = new Date();
    oldStart.setMonth(oldStart.getMonth() - 5, 1);
    const startDate = dateKeyAt(oldStart, user.timezone);
    const profile = await models.MilkProfile.create({
        userId: user.id,
        name: 'Historic',
        defaultQuantityMl: 1000,
        pricePerLitrePaise: 10000,
        startDate,
        isActive: true,
    });
    await models.PriceHistory.create({ userId: user.id, milkProfileId: profile.id, pricePerLitrePaise: 10000, effectiveDate: startDate });
    await models.QuantityHistory.create({ userId: user.id, milkProfileId: profile.id, defaultQuantityMl: 1000, effectiveDate: startDate });
    const month = startDate.slice(0, 7);
    const statement = await request(app)
        .get(`/api/v1/milk/statements/${month}`)
        .set(authorized(data.accessToken));
    assert.equal(statement.status, 200);
    assert.equal(statement.body.data.statement.status, 'provisional');
    assert.equal(statement.body.data.statement.readOnly, true);
    const finalized = await request(app)
        .post(`/api/v1/milk/bills/${month}/finalize`)
        .set(authorized(data.accessToken));
    assert.equal(finalized.status, 201, JSON.stringify(finalized.body));
    const savedTotal = finalized.body.data.bill.totalAmountPaise;
    await models.PriceHistory.updateOne({ milkProfileId: profile.id, effectiveDate: startDate }, { $set: { pricePerLitrePaise: 25000 } });
    const afterChange = await request(app)
        .get(`/api/v1/milk/statements/${month}`)
        .set(authorized(data.accessToken));
    assert.equal(afterChange.body.data.statement.totalAmountPaise, savedTotal);
    assert.equal(afterChange.body.data.statement.status, 'finalized');
});
test('updates a start date repeatedly, calculates partial and full months, preserves exceptions, and syncs to another device', async () => {
    const { data: first } = await registerAccount();
    const today = dateKeyAt(new Date(), 'Asia/Kolkata');
    const range = startDateRangeAt(new Date(), 'Asia/Kolkata');
    const profileResponse = await request(app)
        .post('/api/v1/milk/profiles')
        .set(authorized(first.accessToken))
        .send({ name: 'Milk', defaultQuantityMl: 1500, pricePerLitrePaise: 8000, startDate: today });
    assert.equal(profileResponse.status, 201);
    const profileId = profileResponse.body.data.profile.id;
    const exception = await request(app)
        .put(`/api/v1/milk/entries/${today}`)
        .set(authorized(first.accessToken))
        .send({ quantityMl: 0, note: 'Skipped', version: 0 });
    assert.equal(exception.status, 200);
    const movedBackward = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(first.accessToken))
        .send({ startDate: range.min, expectedStartDate: today });
    assert.equal(movedBackward.status, 200, JSON.stringify(movedBackward.body));
    assert.equal(movedBackward.body.data.profile.startDate, range.min);
    const profileDocument = await models.MilkProfile.findById(profileId);
    assert.ok(profileDocument);
    const seededPrice = await models.PriceHistory.findOne({ milkProfileId: profileId, effectiveDate: range.min });
    const seededQuantity = await models.QuantityHistory.findOne({ milkProfileId: profileId, effectiveDate: range.min });
    assert.equal(seededPrice?.pricePerLitrePaise, 8000);
    assert.equal(seededQuantity?.defaultQuantityMl, 1500);
    const firstMonth = range.min.slice(0, 7);
    const finalMonth = today.slice(0, 7);
    let [year, month] = firstMonth.split('-').map(Number);
    const [lastYear, lastMonth] = finalMonth.split('-').map(Number);
    const months = [];
    while (year < lastYear || (year === lastYear && month <= lastMonth)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month === 13) {
            year += 1;
            month = 1;
        }
    }
    for (const monthKey of months) {
        const response = await request(app)
            .get(`/api/v1/milk/statements/${monthKey}`)
            .set(authorized(first.accessToken));
        assert.equal(response.status, 200, JSON.stringify(response.body));
        const records = response.body.data.statement.records;
        const expectedFirst = monthKey === firstMonth ? Number(range.min.slice(-2)) : 1;
        const expectedLast = monthKey === finalMonth
            ? Number(today.slice(-2))
            : new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)).getUTCDate();
        assert.equal(records.length, expectedLast - expectedFirst + 1);
        assert.equal(records[0].quantityMl, 1500);
        assert.equal(records[0].pricePerLitrePaise, 8000);
        assert.equal(records[0].amountPaise, 12000);
    }
    const persistedException = await models.MilkEntry.findOne({ milkProfileId: profileId, entryDate: today });
    assert.equal(persistedException?.quantityMl, 0);
    assert.equal(persistedException?.note, 'Skipped');
    const secondLogin = await request(app).post('/api/v1/auth/login').send({
        email: first.user.email,
        password: 'a-secure-test-password',
        deviceName: 'Second device',
        deviceId: 'second-start-date-device',
    });
    assert.equal(secondLogin.status, 200);
    const secondProfile = await request(app)
        .get('/api/v1/milk/profiles')
        .set(authorized(secondLogin.body.data.accessToken));
    assert.equal(secondProfile.body.data.profiles[0].startDate, range.min);
    const nextMonthStart = new Date(Date.UTC(Number(range.min.slice(0, 4)), Number(range.min.slice(5, 7)), 1));
    nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
    const nextMonthTenth = `${nextMonthStart.toISOString().slice(0, 7)}-10`;
    const moveForward = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(first.accessToken))
        .send({ startDate: nextMonthTenth, expectedStartDate: range.min });
    assert.equal(moveForward.status, 200, JSON.stringify(moveForward.body));
    const beforeNewStart = await request(app)
        .get(`/api/v1/milk/statements/${firstMonth}`)
        .set(authorized(first.accessToken));
    assert.equal(beforeNewStart.status, 404);
    assert.ok(await models.MilkEntry.exists({ milkProfileId: profileId, entryDate: today }));
    const moveBackwardAgain = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(first.accessToken))
        .send({ startDate: range.min, expectedStartDate: nextMonthTenth });
    assert.equal(moveBackwardAgain.status, 200);
    assert.equal((await models.MilkProfile.findById(profileId))?.startDate, range.min);
});
test('rejects out-of-range and future start dates and detects stale start-date updates', async () => {
    const { data } = await registerAccount();
    const today = dateKeyAt(new Date(), 'Asia/Kolkata');
    const range = startDateRangeAt(new Date(), 'Asia/Kolkata');
    const created = await request(app)
        .post('/api/v1/milk/profiles')
        .set(authorized(data.accessToken))
        .send({ name: 'Milk', defaultQuantityMl: 1000, pricePerLitrePaise: 7000, startDate: today });
    const profileId = created.body.data.profile.id;
    const tooEarly = new Date(`${range.min}T00:00:00.000Z`);
    tooEarly.setUTCDate(tooEarly.getUTCDate() - 1);
    const earlyResponse = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(data.accessToken))
        .send({ startDate: tooEarly.toISOString().slice(0, 10), expectedStartDate: today });
    assert.equal(earlyResponse.status, 422);
    assert.equal(earlyResponse.body.error.code, 'START_DATE_OUT_OF_RANGE');
    const future = new Date(`${today}T00:00:00.000Z`);
    future.setUTCDate(future.getUTCDate() + 1);
    const futureResponse = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(data.accessToken))
        .send({ startDate: future.toISOString().slice(0, 10), expectedStartDate: today });
    assert.equal(futureResponse.status, 422);
    assert.equal(futureResponse.body.error.code, 'START_DATE_OUT_OF_RANGE');
    const updated = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(data.accessToken))
        .send({ startDate: range.min, expectedStartDate: today });
    assert.equal(updated.status, 200);
    const stale = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(data.accessToken))
        .send({ startDate: today, expectedStartDate: today });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'PROFILE_START_DATE_CONFLICT');
});
test('blocks a start-date change that would revise a finalized bill', async () => {
    const { data } = await registerAccount();
    const today = dateKeyAt(new Date(), 'Asia/Kolkata');
    const range = startDateRangeAt(new Date(), 'Asia/Kolkata');
    const created = await request(app)
        .post('/api/v1/milk/profiles')
        .set(authorized(data.accessToken))
        .send({ name: 'Milk', defaultQuantityMl: 1000, pricePerLitrePaise: 7000, startDate: today });
    const profileId = created.body.data.profile.id;
    const finalized = await request(app)
        .post(`/api/v1/milk/bills/${today.slice(0, 7)}/finalize`)
        .set(authorized(data.accessToken));
    assert.equal(finalized.status, 201);
    const change = await request(app)
        .patch(`/api/v1/milk/profiles/${profileId}`)
        .set(authorized(data.accessToken))
        .send({ startDate: range.min, expectedStartDate: today });
    assert.equal(change.status, 409);
    assert.equal(change.body.error.code, 'FINALIZED_BILL_CONFLICT');
    assert.equal((await models.MilkProfile.findById(profileId))?.startDate, today);
    const preservedBill = await models.MonthlyBill.findOne({ milkProfileId: profileId, billMonth: today.slice(0, 7) });
    assert.equal(preservedBill?.status, 'finalized');
});
