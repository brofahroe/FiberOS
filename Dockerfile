FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Generate Prisma Client & Build Next.js
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]

