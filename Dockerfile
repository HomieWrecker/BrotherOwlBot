FROM node:18-alpine  # Smaller image (~5x smaller!)

WORKDIR /usr/src/app

# Install dependencies FIRST (better layer caching)
COPY package*.json ./
RUN npm ci --only=production  # `ci` is stricter than `install`

# Copy all other files
COPY . .

# Verify config.js was copied correctly (debug step)
RUN cat src/config/config.js | grep ownerId  # Should show `process.env.OWNER_ID`

CMD ["node", "index.js"]
