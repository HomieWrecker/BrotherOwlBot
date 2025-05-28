FROM node:18-alpine
WORKDIR /usr/src/app

# First copy ONLY package files
COPY package.json package-lock.json* ./

# Install dependencies (using legacy peer deps if needed)
RUN npm install --production --legacy-peer-deps

# Copy remaining files
COPY . .

CMD ["npm", "start"]
