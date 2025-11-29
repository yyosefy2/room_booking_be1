FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --production

# Copy source
COPY . ./

# Make entrypoint executable
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/usr/src/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "start"]
