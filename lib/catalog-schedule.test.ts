import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogSyncEnabled,
  readIntervalMs,
  shouldRunScheduledSync,
} from "./catalog-schedule.ts";

test("readIntervalMs keeps a sane minimum of one minute", () => {
  assert.equal(readIntervalMs(undefined, 3_600_000), 3_600_000);
  assert.equal(readIntervalMs("7200000", 3_600_000), 7_200_000);
  assert.equal(readIntervalMs("1000", 3_600_000), 3_600_000);
  assert.equal(readIntervalMs("nope", 3_600_000), 3_600_000);
});

test("catalogSyncEnabled can be turned off and skips the production build phase", () => {
  assert.equal(catalogSyncEnabled({}), true);
  assert.equal(catalogSyncEnabled({ CATALOG_SYNC_ENABLED: "0" }), false);
  assert.equal(catalogSyncEnabled({ CATALOG_SYNC_ENABLED: "false" }), false);
  assert.equal(catalogSyncEnabled({ NEXT_PHASE: "phase-production-build" }), false);
});

test("shouldRunScheduledSync waits for the interval after a success", () => {
  const base = {
    now: 10_000_000,
    intervalMs: 3_600_000,
    retryAfterFailureMs: 900_000,
    running: false,
    lastSuccessAtMs: 10_000_000 - 3_600_000,
    lastAttemptAtMs: 10_000_000 - 3_600_000,
    lastAttemptFailed: false,
  };
  assert.equal(shouldRunScheduledSync(base), true);
  assert.equal(shouldRunScheduledSync({ ...base, lastSuccessAtMs: 10_000_000 - 60_000 }), false);
  assert.equal(shouldRunScheduledSync({ ...base, lastSuccessAtMs: null }), true);
  assert.equal(shouldRunScheduledSync({ ...base, running: true }), false);
});

test("shouldRunScheduledSync backs off after a failed attempt", () => {
  assert.equal(
    shouldRunScheduledSync({
      now: 10_000_000,
      intervalMs: 3_600_000,
      retryAfterFailureMs: 900_000,
      running: false,
      lastSuccessAtMs: null,
      lastAttemptAtMs: 10_000_000 - 60_000,
      lastAttemptFailed: true,
    }),
    false,
  );
  assert.equal(
    shouldRunScheduledSync({
      now: 10_000_000,
      intervalMs: 3_600_000,
      retryAfterFailureMs: 900_000,
      running: false,
      lastSuccessAtMs: null,
      lastAttemptAtMs: 10_000_000 - 901_000,
      lastAttemptFailed: true,
    }),
    true,
  );
});
