FROM node:20-slim
WORKDIR /app

# Install openssl for Prisma native binary engine
RUN apt-get update -y && apt-get install -y openssl

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Generate Prisma Client & Build Next.js (build-time fallback URL if not injected via build args)
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fiberos" npx prisma generate
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]
