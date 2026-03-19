import os
import sys
import psycopg2
from urllib.parse import urlparse

def apply_migrations():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Migrator: DATABASE_URL not set. Skipping migrations.")
        return

    print("Migrator: Starting migration process...")
    
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cur = conn.cursor()

        # Ensure migrations table exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename text PRIMARY KEY,
                applied_at timestamptz DEFAULT now()
            );
        """)
        conn.commit()

        migrations_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")
        if not os.path.exists(migrations_dir):
            print(f"Migrator: Migrations directory not found: {migrations_dir}")
            return

        files = sorted([f for f in os.listdir(migrations_dir) if f.endswith(".sql")])
        
        for filename in files:
            cur.execute("SELECT filename FROM schema_migrations WHERE filename = %s", (filename,))
            if cur.fetchone():
                continue  # Already applied

            print(f"Migrator: Applying {filename}...")
            filepath = os.path.join(migrations_dir, filename)
            with open(filepath, "r") as f:
                sql = f.read()
            
            try:
                cur.execute(sql)
                cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (filename,))
                conn.commit()
                print(f"Migrator: Successfully applied {filename}")
            except Exception as e:
                conn.rollback()
                print(f"Migrator: Error applying {filename}: {e}")
                sys.exit(1)

        print("Migrator: All migrations applied.")
        cur.close()
        conn.close()

    except Exception as e:
        print(f"Migrator: Database connection failed: {e}")
        # We don't exit here to allow service to start even if DB is temporarily down,
        # though consistently failing DB means service is degraded.
        pass

if __name__ == "__main__":
    apply_migrations()
