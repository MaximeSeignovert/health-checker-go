FROM alpine:3.22 AS downloader
ARG POCKETBASE_VERSION=0.38.2
ARG TARGETARCH
RUN apk add --no-cache ca-certificates curl unzip \
    && curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_${TARGETARCH}.zip" -o /tmp/pocketbase.zip \
    && unzip /tmp/pocketbase.zip -d /out \
    && chmod +x /out/pocketbase

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g 10001 pocketbase \
    && adduser -D -H -u 10001 -G pocketbase pocketbase \
    && mkdir -p /pb_data \
    && chown -R pocketbase:pocketbase /pb_data
COPY --from=downloader /out/pocketbase /usr/local/bin/pocketbase
COPY pb_hooks /pb_hooks
COPY start-pocketbase.sh /usr/local/bin/start-pocketbase.sh
RUN chmod +x /usr/local/bin/start-pocketbase.sh
USER pocketbase
EXPOSE 8090
VOLUME ["/pb_data"]
ENTRYPOINT ["/usr/local/bin/start-pocketbase.sh"]
