FROM node:18-alpine

COPY package.json package-lock.json README.md ./
RUN npm ci
COPY index.js ./

CMD ["node", "index.js"]
