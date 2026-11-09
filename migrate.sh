#!/bin/bash
set -e

# Migrations are handled natively in-process by server-rs (SqliteMetaStore / PostgresMetaStore).
echo "✅ Migrations are managed natively by server-rs (SqliteMetaStore / PostgresMetaStore)."
