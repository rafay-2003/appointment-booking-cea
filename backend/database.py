
import os
import psycopg
from psycopg.rows import dict_row


def get_connection():
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set"
        )

    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=10
    )


def initialize_database():
    query = """
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            customer_name VARCHAR(100) NOT NULL,
            email VARCHAR(254) NOT NULL,
            appointment_date DATE NOT NULL,
            appointment_time TIME NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),

            CONSTRAINT unique_appointment_slot
                UNIQUE (appointment_date, appointment_time)
        );
    """

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)

    print("Appointment database initialized successfully!")


if __name__ == "__main__":
    initialize_database()
