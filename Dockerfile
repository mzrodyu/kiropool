FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV KIROPOOL_HOST=0.0.0.0
ENV KIROPOOL_PORT=47831

COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/src ./apps/server/src

EXPOSE 47831
VOLUME ["/app/apps/server/data"]

CMD ["node", "apps/server/src/server.js"]
