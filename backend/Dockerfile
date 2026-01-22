FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm install

COPY backend . .

RUN npm run build

COPY frontend/build ./dist/public

EXPOSE 3000

CMD ["node", "dist/server.js"]
