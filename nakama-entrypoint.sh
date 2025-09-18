#!/bin/bash
set -e

echo "🚀 Starting Atlas World Nakama Server..."
echo "📊 Database: $DATABASE_HOST:$DATABASE_PORT"
echo "🔧 Runtime: $RUNTIME_PATH"
echo "👤 Console User: $CONSOLE_USER"
echo "🔑 Console Pass: [SET]"

# Run migration first
echo "🔄 Running database migration..."
/nakama/nakama migrate up \
  --database.address "${DATABASE_HOST:-atlas-database}:${DATABASE_PORT:-26257}"

echo "✅ Migration completed, starting server..."

# Start the server
exec /nakama/nakama \
  --database.address "${DATABASE_HOST:-atlas-database}:${DATABASE_PORT:-26257}" \
  --runtime.path "${RUNTIME_PATH:-/nakama/modules}" \
  --logger.level "${LOG_LEVEL:-DEBUG}" \
  --console.username "${CONSOLE_USER}" \
  --console.password "${CONSOLE_PASS}" \
  "$@"
