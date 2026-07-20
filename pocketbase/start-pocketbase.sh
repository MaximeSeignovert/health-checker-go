#!/bin/sh
set -eu

if [ -z "${PB_SUPERUSER_EMAIL:-}" ] || [ -z "${PB_SUPERUSER_PASSWORD:-}" ]; then
  echo "PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required" >&2
  exit 1
fi

pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb_data
exec pocketbase serve --http=0.0.0.0:8090 --dir=/pb_data --hooksDir=/pb_hooks
