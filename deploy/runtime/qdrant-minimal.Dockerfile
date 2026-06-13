FROM docker.io/qdrant/qdrant:v1.18.2-unprivileged AS upstream

FROM registry.access.redhat.com/ubi9/ubi-minimal:9.8

LABEL org.opencontainers.image.title="Cywell OpsLens Qdrant Runtime Candidate" \
      org.opencontainers.image.description="Runtime-only Qdrant candidate for Cywell OpsLens security review" \
      org.opencontainers.image.source="https://github.com/qdrant/qdrant" \
      org.opencontainers.image.vendor="Cywell"

ENV RUN_MODE=production \
    QDRANT_ALLOW_RECOVERY_MODE=false

WORKDIR /qdrant

RUN microdnf update -y \
    && microdnf install -y ca-certificates libgcc xz-libs \
    && microdnf clean all \
    && mkdir -p /qdrant/storage /qdrant/snapshots \
    && chown -R 1001:0 /qdrant \
    && chmod -R g=u /qdrant

COPY --from=upstream /lib/x86_64-linux-gnu/libunwind-ptrace.so.0 /lib64/libunwind-ptrace.so.0
COPY --from=upstream /lib/x86_64-linux-gnu/libunwind-x86_64.so.8 /lib64/libunwind-x86_64.so.8
COPY --from=upstream /lib/x86_64-linux-gnu/libunwind.so.8 /lib64/libunwind.so.8
COPY --from=upstream --chown=1001:0 /qdrant/qdrant /qdrant/qdrant
COPY --from=upstream --chown=1001:0 /qdrant/config /qdrant/config

USER 1001
EXPOSE 6333 6334

ENTRYPOINT ["/qdrant/qdrant"]
