import sys
import os
sys.path.append(os.getcwd())

from sqlalchemy import create_engine, inspect
from app.core.config import settings

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
inspector = inspect(engine)

print("Tables:", inspector.get_table_names())

if "satellite" in inspector.get_table_names():
    print("\nColumns in 'satellite':")
    for col in inspector.get_columns("satellite"):
        print(f"- {col['name']} ({col['type']})")
else:
    print("'satellite' table not found!")

if "conjunctionevent" in inspector.get_table_names():
    print("\nColumns in 'conjunctionevent':")
    for col in inspector.get_columns("conjunctionevent"):
        print(f"- {col['name']} ({col['type']})")
else:
    print("'conjunctionevent' table not found!")

from sqlalchemy import text
with engine.connect() as conn:
    try:
        if "satellite" in inspector.get_table_names():
            cnt = conn.execute(text("SELECT count(*) FROM satellite")).scalar()
            print(f"\nTotal Satellites: {cnt}")
        if "tle" in inspector.get_table_names():
            cnt = conn.execute(text("SELECT count(*) FROM tle")).scalar()
            print(f"Total TLEs: {cnt}")
        if "conjunctionevent" in inspector.get_table_names():
            cnt = conn.execute(text("SELECT count(*) FROM conjunctionevent")).scalar()
            print(f"Total Conjunctions: {cnt}")
    except Exception as e:
        print(f"Error counting rows: {e}")
