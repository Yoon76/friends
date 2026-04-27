-- The Iron Curtain: Global Diplomacy - Database Setup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Nations table
CREATE TABLE IF NOT EXISTS nations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Territories table
CREATE TABLE IF NOT EXISTS territories (
    id INTEGER PRIMARY KEY, -- 0 to 99
    owner_id UUID REFERENCES nations(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'Plains', -- Plains, Mountains, Cities
    troops INTEGER NOT NULL DEFAULT 0,
    tanks INTEGER NOT NULL DEFAULT 0,
    fortifications INTEGER NOT NULL DEFAULT 0
);

-- Orders table
CREATE TABLE IF NOT EXISTS nation_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nation_id UUID REFERENCES nations(id) NOT NULL,
    day INTEGER NOT NULL,
    territory_id INTEGER REFERENCES territories(id),
    order_type TEXT NOT NULL, -- 'TRAIN', 'TANK', 'MOVE', 'ATTACK'
    target_id INTEGER REFERENCES territories(id),
    amount INTEGER NOT NULL DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game State table
CREATE TABLE IF NOT EXISTS nation_game_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_resolved_day INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT singleton CHECK (id = 1)
);

-- RLS Policies
ALTER TABLE nations ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE nation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE nation_game_state ENABLE ROW LEVEL SECURITY;

-- Nations: Public read, Auth insert
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read nations') THEN
    CREATE POLICY "Public read nations" ON nations FOR SELECT USING (true);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth insert nation') THEN
    CREATE POLICY "Auth insert nation" ON nations FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;

-- Territories: Public read, Public update (for engine)
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read territories') THEN
    CREATE POLICY "Public read territories" ON territories FOR SELECT USING (true);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public update territories') THEN
    CREATE POLICY "Public update territories" ON territories FOR UPDATE USING (true);
END IF;

-- Orders: Public read, Auth insert, Public update
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read orders') THEN
    CREATE POLICY "Public read orders" ON nation_orders FOR SELECT USING (true);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth insert orders') THEN
    CREATE POLICY "Auth insert orders" ON nation_orders FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM nations WHERE id = nation_id));
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public update orders') THEN
    CREATE POLICY "Public update orders" ON nation_orders FOR UPDATE USING (true);
END IF;

-- Game State: Public read/update
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read state') THEN
    CREATE POLICY "Public read state" ON nation_game_state FOR SELECT USING (true);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public update state') THEN
    CREATE POLICY "Public update state" ON nation_game_state FOR UPDATE USING (true);
END IF;

-- Initial State
INSERT INTO nation_game_state (id, last_resolved_day) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- Initialize 100 territories
DO $$
BEGIN
    FOR i IN 0..99 LOOP
        INSERT INTO territories (id, type)
        VALUES (i, 
            CASE 
                WHEN random() < 0.1 THEN 'Cities'
                WHEN random() < 0.2 THEN 'Mountains'
                ELSE 'Plains'
            END
        ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
END $$;
