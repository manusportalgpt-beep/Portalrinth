-- The CurseForge key the person brought, kept in a table of its own.
--
-- It was a column of the settings, and two migrations wanted to add it: one
-- of this fork's, one of the fork's own. Whichever ran first added it and the
-- other failed, and a migration that fails leaves the launcher unable to open
-- its own database - which looks like nothing happening at all, because the
-- window is only shown once the interface is up.
--
-- A table of its own says the same thing and cannot collide: "if not exists"
-- is a thing a table can say and a column cannot.
CREATE TABLE IF NOT EXISTS curseforge_user_key (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    key TEXT NULL
);
