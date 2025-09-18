#!/bin/bash
set -e

echo "🔄 Running Nakama database migration..."

/nakama/nakama migrate up \
  --database.address "root@atlas-database:26257/defaultdb?sslmode=disable" \
  --logger.level "INFO"

echo "✅ Migration completed!"
