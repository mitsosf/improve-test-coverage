# Frontend Dockerfile - Multi-stage build with nginx
# Stage 1: Build
FROM node:24-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/cli/package.json ./packages/cli/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY frontend ./frontend

# Build shared first, then frontend
RUN pnpm --filter=@coverage-improver/shared build
RUN pnpm --filter=@coverage-improver/frontend build

# Stage 2: Production with nginx
FROM nginx:alpine AS runner

# Copy built static files
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
