# Use the official Alpine Linux image with Node.js pre-installed
FROM node:20

# Install Chromium
RUN apt-get update && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package.json ./
COPY package-lock.json ./
# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

RUN ls -l /app


# Expose the port that your application will run on
EXPOSE 80

# Command to start the application with PM2
CMD ["node", "build/index.js"]
