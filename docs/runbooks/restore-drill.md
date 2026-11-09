# Runbook — Monthly restore drill

Targets (01-requirements §7): **RPO ≤ 5 min** (WAL archived at least every 60 s), **RTO ≤ 1 h**.
Owner: tech lead. Frequency: monthly, and after any change to backup configuration.

## 1. Production / staging drill (pgBackRest point-in-time restore)

Run against a **scratch server**, never against the primary or replica.

1. Create a scratch server from the same Terraform image (`cx22` is enough), join the private network, apply the `common` and `postgres` roles with `db_role: drill` (no stanza creation, no cron).
2. Pick a target time 10 minutes in the past and note it.
3. Restore:
   ```bash
   sudo -u postgres pgbackrest --stanza=main --type=time --target="<UTC timestamp>" \
     --target-action=promote --delta restore
   sudo systemctl start postgresql@18-main
   ```
4. Verify:
   - `SELECT count(*) FROM schema_migrations;` matches production.
   - `SELECT max(created_at) FROM alerts;` is within 5 minutes of the target time (RPO).
   - Row counts for `users`, `subscriptions`, `qr_tokens`, `alerts` are within the expected range.
   - `SELECT run_retention();` succeeds.
   - Decrypt one known test row with the staging data key (proves the key and ciphertext survived).
5. Record start and end time below. RTO is the time from step 3 to a passing step 4.
6. Destroy the scratch server (`terraform destroy -target=...`) and remove its volume: it holds personal data.

If the drill fails: open an incident, keep the scratch server for analysis (VPN only), and do not change the backup configuration until the cause is understood.

## 2. Local drill (developer machines, every PR touching the schema)

```bash
npm run db:restore-drill
```

Takes a consistent logical backup of every table (`REPEATABLE READ` snapshot), rebuilds a fresh database from `db/migrations`, restores the data, resets identity sequences and compares every table by row count and content checksum. Passes only if all tables match.

## 3. Drill log

| Date | Environment | Type | Data | Duration | Result | By |
|---|---|---|---|---|---|---|
| 2026-11-09 | Local (embedded PostgreSQL 18.6) | Logical backup + restore | 46 tables, 68 seed rows | 9.1 s | Pass | Claude (Sprint 1) |
