#!/bin/bash
set -e

echo "Initializing database tables..."
python -c "import asyncio; from db.database import init_db; asyncio.run(init_db()); print('Tables ready')"

echo "Checking migration state..."
# If alembic_version table doesn't exist, this is a fresh DB — stamp to head
# (init_db already created all tables matching current schema)
python -c "
import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def check():
    raw = os.getenv('DATABASE_URL', '')
    url = raw.replace('postgresql://', 'postgresql+asyncpg://', 1) if raw.startswith('postgresql://') else raw
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        result = await conn.execute(text(\"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version')\"))
        exists = result.scalar()
    await engine.dispose()
    print('HAS_ALEMBIC=' + ('1' if exists else '0'))
    return exists

has = asyncio.run(check())
exit(0 if has else 1)
" && {
    echo "Existing DB — running migrations..."
    alembic upgrade head
} || {
    echo "Fresh DB — stamping alembic to head..."
    alembic stamp head
}

echo "Starting server on port ${PORT:-8000}..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
