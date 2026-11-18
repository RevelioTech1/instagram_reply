import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INBOX_POLL_INTERVAL_MS,
  inboxPollEnabled,
  readInboxPollIntervalMs,
  readInboxTickMs,
  shouldRunScheduledInboxPoll,
} from "./inbox-poll-schedule.ts";

test("readInboxPollIntervalMs enforces a 5 minute floor", () => {
  assert.equal(readInboxPollIntervalMs(undefined, DEFAULT_INBOX_POLL_INTERVAL_MS), DEFAULT_INBOX_POLL_INTERVAL_MS);
  assert.equal(readInboxPollIntervalMs("60000", DEFAULT_INBOX_POLL_INTERVAL_MS), DEFAULT_INBOX_POLL_INTERVAL_MS);
  assert.equal(readInboxPollIntervalMs("300000", DEFAULT_INBOX_POLL_INTERVAL_MS), 300_000);
  assert.equal(readInboxPollIntervalMs("600000", DEFAULT_INBOX_POLL_INTERVAL_MS), 600_000);
});

test("readInboxTickMs allows one-minute ticks", () => {
  assert.equal(readInboxTickMs("60000", 60_000), 60_000);
  assert.equal(readInboxTickMs("1000", 60_000), 60_000);
});

test("inboxPollEnabled defaults on and respects off flags", () => {
  assert.equal(inboxPollEnabled({}), true);
  assert.equal(inboxPollEnabled({ INBOX_POLL_ENABLED: "0" }), false);
  assert.equal(inboxPollEnabled({ INBOX_POLL_ENABLED: "false" }), false);
  assert.equal(inboxPollEnabled({ NEXT_PHASE: "phase-production-build" }), false);
});

test("shouldRunScheduledInboxPoll respects interval and retry after failure", () => {
  const base = {
    now: 1_000_000,
    intervalMs: 420_000,
    retryAfterFailureMs: 300_000,
    running: false,
    lastSuccessAtMs: null as number | null,
    lastAttemptAtMs: null as number | null,
    lastAttemptFailed: false,
  };
  assert.equal(shouldRunScheduledInboxPoll(base), true);
  assert.equal(shouldRunScheduledInboxPoll({ ...base, running: true }), false);
  assert.equal(
    shouldRunScheduledInboxPoll({ ...base, lastSuccessAtMs: 1_000_000 - 100_000 }),
    false,
  );
  assert.equal(
    shouldRunScheduledInboxPoll({ ...base, lastSuccessAtMs: 1_000_000 - 420_000 }),
    true,
  );
  assert.equal(
    shouldRunScheduledInboxPoll({
      ...base,
      lastAttemptFailed: true,
      lastAttemptAtMs: 1_000_000 - 60_000,
    }),
    false,
  );
  assert.equal(
    shouldRunScheduledInboxPoll({
      ...base,
      lastAttemptFailed: true,
      lastAttemptAtMs: 1_000_000 - 300_000,
      lastSuccessAtMs: null,
    }),
    true,
  );
});
