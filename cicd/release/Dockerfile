FROM node:16-alpine

ENV TZ=Asia/Tokyo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN apk add openssl1.1-compat && rm -rf /var/cache/apk/*

WORKDIR /app
COPY yarn.lock .npmrc ./
COPY package.deps.json package.json
RUN yarn install
COPY . .
RUN yarn build
CMD ["yarn", "start"]
