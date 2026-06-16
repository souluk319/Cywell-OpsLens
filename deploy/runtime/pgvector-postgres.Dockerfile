FROM docker.io/pgvector/pgvector:pg16

LABEL org.opencontainers.image.title="Cywell OpsLens Postgres pgvector Runtime Candidate" \
      org.opencontainers.image.description="Runtime-only Postgres pgvector candidate for Cywell OpsLens security review" \
      org.opencontainers.image.source="https://github.com/pgvector/pgvector" \
      org.opencontainers.image.vendor="Cywell"

ENV POSTGRES_DB=opslens \
    POSTGRES_USER=opslens

EXPOSE 5432
