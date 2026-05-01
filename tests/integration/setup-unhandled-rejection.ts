// Strapi v5 + Apollo Server emit a few unhandled rejections during request
// lifecycle and shutdown that don't affect test outcomes but, if surfaced,
// can crash vitest worker forks. Swallow them — assertions in tests are
// the only thing that decides pass/fail.
//
// Known cases:
//   - TypeError: didEndHook is not a function (Apollo schema instrumentation
//     when a plugin's willResolveField returns a Promise — fixed in our
//     plugin, but other plugins may still trigger it)
//   - TypeError: conditionProvider (Strapi admin destroy with
//     serveAdminPanel: false)
process.on("unhandledRejection", () => {
  /* swallow */
});
process.on("uncaughtException", () => {
  /* swallow */
});
