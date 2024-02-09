# Use the official Alpine Linux image with Node.js pre-installed
FROM node:14-alpine

# Install PM2 globally
RUN npm install -g pm2

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose the port that your application will run on
EXPOSE 80

# Command to start the application with PM2
CMD ["pm2-runtime", "build/index.js"]
