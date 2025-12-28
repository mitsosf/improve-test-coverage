FROM node:24-slim

# Install git for cloning repositories
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create workspace and output directories
WORKDIR /workspace
RUN mkdir -p /output /input

# Copy entry script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
