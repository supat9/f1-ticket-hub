ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'cs'
CHECK (role IN ('admin', 'cs', 'dev'));
