# syntax=docker/dockerfile:1

FROM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.27-alpine AS server
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=web /src/server/dist ./dist
# modernc sqlite is pure Go, so the binary is fully static.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/pulse .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget && adduser -D -u 10001 pulse && mkdir /data && chown pulse /data
USER pulse
COPY --from=server /out/pulse /usr/local/bin/pulse
ENV PULSE_ADDR=:8080 PULSE_DB=/data/pulse.db
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["pulse"]
