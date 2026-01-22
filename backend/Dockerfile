
# Build frontend
FROM node:20-slim as frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend ./
RUN npm run build

# Build backend
FROM node:20-slim as backend-builder

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend ./
RUN npm run build

# Final image
FROM node:20-slim

WORKDIR /app

COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /frontend/build ./dist/public

EXPOSE 3000

CMD ["node", "dist/server.js"]
