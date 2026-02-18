"""convert_tle_to_hypertable

Revision ID: timescale_001
Revises: e28fb27ef5eb
Create Date: 2024-03-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'timescale_001'
down_revision = 'e28fb27ef5eb'
branch_labels = None
depends_on = None


def upgrade():
    # Enable TimescaleDB extension
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
    
    # Convert TLE table to hypertable
    # Partition by 'epoch' time column
    # chunk_time_interval = 1 week (604800000000 microseconds or similar)
    # shorter interval is better for TLEs as query patterns are usually "latest" or small windows
    op.execute("SELECT create_hypertable('tle', 'epoch', chunk_time_interval => INTERVAL '1 week', if_not_exists => TRUE);")


def downgrade():
    # We cannot easily revert a hypertable to a normal table without data loss or complex migration
    # For now, simplistic downgrade invalid
    pass
