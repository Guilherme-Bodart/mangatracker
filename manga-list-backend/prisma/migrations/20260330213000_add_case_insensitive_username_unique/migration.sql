DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER("username")
    FROM "User"
    GROUP BY LOWER("username")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create case-insensitive unique username index because duplicates already exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_lower_key"
  ON "User"(LOWER("username"));
