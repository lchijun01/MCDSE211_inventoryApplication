FROM node:18.15.0

WORKDIR /app

COPY package*.json ./

RUN npm install -g node-pre-gyp
RUN npm install --save bcrypt
RUN node_modules/.bin/node-pre-gyp install --fallback-to-build

COPY . .


CMD ["npm", "start"]
