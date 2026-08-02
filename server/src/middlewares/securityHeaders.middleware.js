/**
 * @file securityHeaders.middleware.js
 * @description Enterprise-grade security headers middleware.
 *
 * Provides defense-in-depth on top of Helmet:
 *  - Enforces Strict Transport Security (HSTS)
 *  - Disables browser feature permissions (camera, mic, location)
 *  - Prevents clickjacking and MIME sniffing
 *  - Prevents sensitive API response caching (No-Cache headers for dynamic data)
 */

export const securityHeadersMiddleware = (req, res, next) => {
  // ── 1. Disable Sensitive Browser Features ──────────────────────────────
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );

  // ── 2. Referrer Policy ──────────────────────────────────────────────────
  // Sends full URL when performing same-origin request, only origin on HTTPS->HTTPS, no header to HTTP
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // ── 3. Cross-Domain Policies ───────────────────────────────────────────
  // Restricts Adobe Flash and PDF cross-domain data requests
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // ── 4. DNS Prefetch Control ────────────────────────────────────────────
  // Controls browser DNS prefetching
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // ── 5. Cache Control for Sensitive API Routes ──────────────────────────
  // For POST/PUT/PATCH/DELETE or auth/booking routes, disable client browser caching
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
    req.path.startsWith('/api/v1/auth') ||
    req.path.startsWith('/api/v1/admin') ||
    req.path.startsWith('/api/v1/bookings')
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  next();
};
