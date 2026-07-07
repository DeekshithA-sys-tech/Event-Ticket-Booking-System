/**
 * @file asyncHandler.js
 * @description Higher-order function that wraps async route handlers.
 *
 * THE PROBLEM IT SOLVES:
 * -----------------------
 * Every async Express route handler needs explicit error handling:
 *
 *   router.get('/users', async (req, res, next) => {
 *     try {
 *       const users = await userService.getAll();
 *       res.json(users);
 *     } catch (error) {
 *       next(error); // ← every single handler needs this
 *     }
 *   });
 *
 * If you forget the try/catch, an unhandled promise rejection crashes Node.js
 * (or silently hangs the request in older versions).
 *
 * THE SOLUTION:
 * -------------
 * asyncHandler wraps the handler so that any thrown error or rejected promise
 * is automatically forwarded to next(error) — which triggers the global
 * error middleware.
 *
 *   router.get('/users', asyncHandler(async (req, res) => {
 *     const users = await userService.getAll(); // throws → auto-caught
 *     res.json(users);
 *   }));
 *
 * Clean, DRY, no repeated try/catch.
 *
 * This is the industry standard pattern — used in Express docs, NestJS,
 * and virtually every production Express codebase.
 */

/**
 * Wraps an async Express route handler to catch errors and forward to next().
 *
 * @param {Function} fn - Async route handler function (req, res, next) => Promise
 * @returns {Function} Wrapped handler that automatically catches async errors
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
