# Imagen de desarrollo: el código se monta como volumen y Next recarga al editar.
FROM node:24-slim

RUN corepack enable

WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml* ./
RUN yarn install --immutable

COPY . .

EXPOSE 3000
CMD ["yarn", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
