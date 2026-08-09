FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/licensing/package.json ./package.json
RUN npm install --omit=dev
COPY apps/licensing/server.mjs ./server.mjs
RUN sed -i "s/((\$5+7)||' days')::interval/(((\$5)::int+7)||' days')::interval/g; s/(\$5||' days')::interval/((\$5)::int||' days')::interval/g; s/version:'v2'/version:'v4'/g; s/Portal v2 listening/Portal v4 listening/g" ./server.mjs
COPY apps/licensing/public ./public
EXPOSE 5060
CMD ["npm","start"]
