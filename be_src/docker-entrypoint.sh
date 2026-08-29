#!/bin/sh
# Apply schema migrations, then hand off to the server command (CMD, or the
# `command:` override in a compose file). Postgres readiness is guaranteed by
# the compose healthcheck on the db service.
set -e
alembic upgrade head
exec "$@"
