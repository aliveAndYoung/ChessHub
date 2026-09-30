from collections.abc import Generator
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Settings(BaseSettings):
    postgres_user: str = Field(validation_alias="POSTGRES_USER")
    postgres_password: str = Field(validation_alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(validation_alias="POSTGRES_DB")
    postgres_host: str = Field(validation_alias="POSTGRES_HOST")
    postgres_port: int = Field(validation_alias="POSTGRES_PORT")

    model_config = SettingsConfigDict(case_sensitive=True, extra="ignore")

    @property
    def database_url(self) -> str:
        username = quote_plus(self.postgres_user)
        password = quote_plus(self.postgres_password)
        return (
            f"postgresql+psycopg2://{username}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()