FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    fontconfig \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 8000

ENV DATABASE=/.coax
ENV PORT=8000

CMD ["node", "--expose-gc", "index.js"]
