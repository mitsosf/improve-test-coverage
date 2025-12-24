# Coverage Improver - Development Guide

## Project Overview
A NestJS service that automatically improves TypeScript test coverage by generating tests via AI (Claude/OpenAI) and submitting them as GitHub PRs.

## Development Workflow
- Each commit is a self-contained, testable unit
- After each commit, test before continuing
- CLI before Frontend (React is cherry on top)

## Quick Start
```bash
# Install dependencies
pnpm install

# Start backend in dev mode
pnpm dev --filter=@coverage-improver/backend

# Start frontend (after Sprint 4)
pnpm dev --filter=@coverage-improver/frontend

# Run CLI (after Sprint 3)
cd packages/cli && pnpm link --global
cov --help
```

## Architecture
- **backend/**: NestJS with DDD (Domain-Driven Design)
- **frontend/**: React + Vite dashboard
- **packages/cli/**: Commander.js CLI
- **packages/shared/**: Shared types

## DDD Layers (backend/src/)
- **domain/**: Pure business logic (no framework deps)
- **application/**: Use cases, orchestration
- **infrastructure/**: NestJS, SQLite, GitHub API, AI CLI

## Key Commands
```bash
# Development
pnpm dev                                    # All packages
pnpm dev --filter=@coverage-improver/backend  # Backend only

# Build
pnpm build

# Test
pnpm test

# Docker
docker compose up              # Start all services
docker compose build           # Build images
```

## Environment Variables
See `.env.example` for required variables.
