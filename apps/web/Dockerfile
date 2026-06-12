FROM registry.access.redhat.com/ubi9/nodejs-22:latest

USER 0
WORKDIR /opt/app-root/src

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/operator-controller/package.json packages/operator-controller/package.json
COPY packages/rag/package.json packages/rag/package.json

RUN npm ci --workspaces --include-workspace-root

COPY apps/web apps/web
COPY packages/contracts packages/contracts

RUN npm run -w @kugnus/contracts build \
  && npm run -w @kugnus/web build

RUN chown -R 1001:0 /opt/app-root/src \
  && chmod -R g=u /opt/app-root/src

ENV NODE_ENV=production

EXPOSE 8080
USER 1001

CMD ["npm", "run", "-w", "@kugnus/web", "preview", "--", "--host", "0.0.0.0", "--port", "8080"]
