#!/bin/bash
set -e

echo "Initializing database tables..."
python -c "
import asyncio
from db.database import init_db
asyncio.run(init_db())
print('Tables initialized')
"

echo "Running database migrations..."
alembic upgrade head

echo "Starting server on port ${PORT:-8000}..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
