# Backend Dockerfile - Multi-stage build
# Stage 1: Build
FROM node:24-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.1 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY backend ./backend

# Build shared first, then backend
RUN pnpm --filter=@coverage-improver/shared build
RUN pnpm --filter=@coverage-improver/backend build

# Create a production deployment
WORKDIR /app/backend
RUN pnpm deploy --filter=@coverage-improver/backend --prod /prod

# Stage 2: Production
FROM node:24-alpine AS runner

# Install git (needed for cloning repos) and curl (fallback for API calls)
RUN apk add --no-cache git curl

# Install AI CLIs globally
RUN npm install -g @anthropic-ai/claude-code @openai/codex

WORKDIR /app

# Copy production deployment
COPY --from=builder /prod ./

# Copy built artifacts
COPY --from=builder /app/backend/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /app/data /tmp/coverage-improver

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/main.js"]
