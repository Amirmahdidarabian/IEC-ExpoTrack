export type HeaderValue = { key: string; value: string };

export function buildSecurityHeaders(options: { production: boolean; httpsEnabled: boolean }): HeaderValue[] {
  const contentSecurityPolicy = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'", "object-src 'none'",
    "img-src 'self' data:", "font-src 'self' data:", "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${options.production ? "" : " 'unsafe-eval'"}`,
    "connect-src 'self'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ...(options.production && options.httpsEnabled ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
  ];
}
