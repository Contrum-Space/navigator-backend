# Use Alpine-based Node.js image for smaller size
FROM node:20-alpine

# Create app directory and set ownership
WORKDIR /app

# Create and use non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source files and build
COPY --chown=appuser:appgroup . .
RUN npm run build && \
    rm -rf src/ && \
    rm -rf node_modules/typescript

# Switch to non-root user
USER appuser

# Expose the port
EXPOSE 80

# Command to start the application
CMD ["node", "build/index.js"]
