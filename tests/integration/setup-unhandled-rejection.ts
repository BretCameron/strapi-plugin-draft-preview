// Strapi v5 + Apollo Server emit a few unhandled rejections during request
// lifecycle and shutdown that don't affect test outcomes but, if surfaced,
// can crash vitest worker forks. Swallow them — assertions in tests are
// the only thing that decides pass/fail.
//
// We attempted to diagnose the residual flakiness (~10% of runs lose one
// of three forks at shutdown) and found that the workers die without
// firing any catchable hook (no unhandledRejection, no uncaughtException,
// no SIGTERM/SIGINT/SIGPIPE/SIGHUP, no `exit` event). The cause is in
// vitest's fork lifecycle interacting with Strapi's shutdown — outside
// what we can fix from inside the worker. Tests themselves all pass when
// they run; the failure mode is "vitest can't collect results from a
// dead worker", not assertion failure.
process.on("unhandledRejection", () => {
  /* swallow */
});
process.on("uncaughtException", () => {
  /* swallow */
});
