import sys
import os
sys.path.append(os.getcwd())

from sqlalchemy import create_engine, MetaData
from app.core.config import settings
from app.db.base import Base

def reset_db():
    print("Resetting database...")
    engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
    
    # Reflect all tables to drop everything, not just known models
    meta = MetaData()
    meta.reflect(bind=engine)
    
    print(f"Dropping tables: {meta.sorted_tables}")
    meta.drop_all(bind=engine)
    
    # Also drop alembic_version specifically if not caught
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        conn.commit()

    print("Database reset complete.")

from sqlalchemy import text

if __name__ == "__main__":
    reset_db()
