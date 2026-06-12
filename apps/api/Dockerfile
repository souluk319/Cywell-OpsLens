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

COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/rag packages/rag
COPY data/runbooks data/runbooks

RUN npm run -w @kugnus/contracts build \
  && npm run -w @kugnus/rag build \
  && npm run -w @kugnus/api build

RUN chown -R 1001:0 /opt/app-root/src \
  && chmod -R g=u /opt/app-root/src

ENV NODE_ENV=production
ENV PORT=8080
ENV KUGNUS_API_HOST=0.0.0.0

EXPOSE 8080 9443
USER 1001

CMD ["npm", "run", "-w", "@kugnus/api", "start"]
