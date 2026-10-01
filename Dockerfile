FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS migrator
WORKDIR /app
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG HTTPS_ENABLED=false
ENV NEXT_TELEMETRY_DISABLED=1 HTTPS_ENABLED=${HTTPS_ENABLED}
RUN npx prisma generate && npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# This server-only package loads its country/city JSON files dynamically, so
# Next.js file tracing cannot discover the data directory on its own.
COPY --from=builder /app/node_modules/@countrystatecity/countries ./node_modules/@countrystatecity/countries
COPY --from=builder /app/scripts/runtime-env.mjs ./scripts/runtime-env.mjs
COPY --from=builder /app/scripts/docker-start.mjs ./scripts/docker-start.mjs
USER nextjs
EXPOSE 3000
CMD ["node", "scripts/docker-start.mjs"]
