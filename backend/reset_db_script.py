from app.db.session import engine
from app.db.base import Base
from sqlalchemy import text

def reset_db():
    print("Dropping all tables...")
    # Base.metadata.drop_all(bind=engine)
    # Using raw SQL to ensure everything is gone even if metadata is incomplete
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS tle CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS satellite CASCADE"))
        conn.commit()
    
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database reset complete.")

if __name__ == "__main__":
    reset_db()
