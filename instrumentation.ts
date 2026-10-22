export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startCatalogScheduler } = await import("./lib/sync");
  startCatalogScheduler();
}
