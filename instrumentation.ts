export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCatalogScheduler } = await import("./lib/sync");
    const { startInboxPollScheduler } = await import("./lib/inbox-poll");
    startCatalogScheduler();
    startInboxPollScheduler();
  }
}
