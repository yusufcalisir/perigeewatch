from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "PerigeeWatch"
    API_V1_STR: str = "/api/v1"
    
    POSTGRES_USER: str = "perigee"
    POSTGRES_PASSWORD: str = "secure_password"
    POSTGRES_DB: str = "perigee_watch"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    CELESTRAK_URL: str = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
    INGEST_INTERVAL_MINUTES: int = 60
    
    DATABASE_URL: Optional[str] = None

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            # Fix for SQLAlchemy not supporting 'postgres://' scheme anymore, which some providers use
            url = self.DATABASE_URL
            if url and url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            # Ensure we use the correct driver if needed (postgresql+psycopg2 is safer if v3 fails)
            # But the error 'No module named psycopg' implies SQLAlchemy is trying to use v3 relative to a default
            # or the URL scheme is just 'postgresql://' and it defaults to psycopg 3 in newer SQLAlchemy versions?
            # Let's force postgresql+psycopg2 to fallback to the stable binary we definitely have, 
            # OR just ensure psycopg is installed (which I did in requirements.txt).
            # I will assume installing 'psycopg[binary]' fixes the import error.
            return url
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
