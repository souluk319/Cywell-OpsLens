FROM --platform=$BUILDPLATFORM golang:1.25.11 AS builder
WORKDIR /workspace
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o manager ./main.go

FROM registry.access.redhat.com/ubi9/ubi-minimal:9.8
WORKDIR /
RUN microdnf update -y && microdnf clean all
COPY --from=builder /workspace/manager /manager
USER 65532:65532
ENTRYPOINT ["/manager"]
