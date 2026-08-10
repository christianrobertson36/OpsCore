FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/licensing/package.json ./package.json
RUN npm install --omit=dev
COPY apps/licensing/server.mjs ./server.mjs
COPY apps/licensing/public ./public
EXPOSE 5060
CMD ["npm","start"]
