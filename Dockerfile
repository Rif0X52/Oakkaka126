FROM node:18-bullseye

# Install CA certificates (needed for HTTPS to Telegram API)
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install --include=dev

COPY . .

RUN npm run build

EXPOSE 7860

ENV PORT=7860
ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

CMD ["node", "dist/index.js"]
