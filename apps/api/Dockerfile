FROM registry.access.redhat.com/ubi9/nodejs-22:latest

USER 0
WORKDIR /opt/app-root/src

COPY --chown=1001:0 package.json package-lock.json tsconfig.base.json ./
COPY --chown=1001:0 apps/api/package.json apps/api/package.json
COPY --chown=1001:0 apps/web/package.json apps/web/package.json
COPY --chown=1001:0 packages/contracts/package.json packages/contracts/package.json
COPY --chown=1001:0 packages/operator-controller/package.json packages/operator-controller/package.json
COPY --chown=1001:0 packages/rag/package.json packages/rag/package.json

USER 1001
RUN npm ci --workspaces --include-workspace-root

COPY --chown=1001:0 apps/api apps/api
COPY --chown=1001:0 packages/contracts packages/contracts
COPY --chown=1001:0 packages/rag packages/rag
COPY --chown=1001:0 data/runbooks data/runbooks

RUN npm run -w @kugnus/contracts build \
  && npm run -w @kugnus/rag build \
  && npm run -w @kugnus/api build

ENV NODE_ENV=production
ENV PORT=8080
ENV KUGNUS_API_HOST=0.0.0.0

EXPOSE 8080 9443

CMD ["npm", "run", "-w", "@kugnus/api", "start"]
