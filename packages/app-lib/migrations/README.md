# Migrations

A migration's version is the number its filename starts with, and
`_sqlx_migrations` keys applied migrations by it. Two files sharing a version
cannot both be applied, and a version whose file changes after it has been
applied makes sqlx refuse to open the database at all.

Upstream names its migrations `<YYYYMMDD>120000_<name>.sql`, using `130000`,
`140000` and so on when a day needs more than one. Portalrinth followed the same
convention, so both sides eventually picked the same number on the same day —
`20260911120000` was upstream's `linked-server-project-source` and the fork's
`offline-accounts`. The fork's had already shipped, so upstream's was the one
renumbered, to `20260911121500`.

**A new Portalrinth migration takes a minute upstream does not use: `<YYYYMMDD>1215<NN>.sql`**,
counting `121500`, `121501`, … within a day. Upstream lands on the hour, so a
collision needs them to pick a quarter past — which they never have.

Never renumber or edit a migration that has been released. Add a new one.

That includes the parts of the file nobody reads. sqlx keeps a checksum of the
whole file, so changing a comment in a migration that has already run is
indistinguishable from changing what it did: every installed copy refuses to open
its database and the launcher will not start. A rename that touches a migration
folder has to leave the files in it byte for byte.