#!/bin/bash
set -e

echo "Initializing database..."
python -c "
import asyncio
from db.database import init_db, engine
from sqlalchemy import text

async def setup():
    # Create all tables from current models
    await init_db()

    # Check if alembic_version table exists (fresh DB vs existing)
    async with engine.connect() as conn:
        result = await conn.execute(text(
            \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version')\"
        ))
        has_alembic = result.scalar()

    if not has_alembic:
        # Fresh DB: tables created by init_db() match latest schema.
        # Stamp alembic to head so it doesn't try to replay migrations.
        import subprocess
        subprocess.run(['alembic', 'stamp', 'head'], check=True)
        print('Fresh DB: stamped alembic to head')
    else:
        # Existing DB: run any pending migrations
        subprocess.run(['alembic', 'upgrade', 'head'], check=True)
        print('Existing DB: migrations applied')

asyncio.run(setup())
"

echo "Starting server on port ${PORT:-8000}..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
