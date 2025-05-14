# Use official Node.js LTS image
FROM node:18

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the bot files
COPY . .

# Set environment variables (optional)
ENV NODE_ENV=production

# Start the bot
CMD ["node", "index.js"]