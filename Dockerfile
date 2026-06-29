FROM node:18-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /home/node/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8000

ENV DATABASE=/.coax
ENV PORT=8000

CMD ["node", "index.js"]
