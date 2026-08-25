#!/bin/sh
set -e

# Runs once, on first container start, via MySQL's docker-entrypoint-initdb.d convention. A `.sh`
# script here (unlike the `.sql` file this replaces) gets shell environment-variable expansion,
# which is what lets this credential's password follow the same override pattern as the other two
# accounts docker-compose.yml creates (`MYSQL_ROOT_PASSWORD`, `MYSQL_MIGRATE_PASSWORD`) instead of
# being the one hardcoded exception — flagged in review, since a password with no override path is
# also the one guaranteed to reach a non-local environment unchanged if this compose file is ever
# reused past local dev.
#
# The `MYSQL_USER`/`MYSQL_PASSWORD` variables in docker-compose.yml create `siders_migrate` with
# full privileges on `siders` — that's the account migrations run as. The running API must not
# share it: openspec/changes/migrate-postgres-to-mysql/design.md, "Row Level Security is deleted,
# not emulated" replaces Postgres's RLS default-deny with a least-privilege grant instead — the
# API's credential can read and write rows but cannot alter schema.
#
# Host is left as `%` (any host), not scoped to a container subnet: this compose file defines no
# `api` service — the API runs outside it, reaching MySQL through the published `3306:3306` port —
# so there is no fixed container IP/CIDR to scope to. See db/README.md for the network-exposure
# trade-off this leaves in place.
API_PASSWORD="${MYSQL_API_PASSWORD:-local-dev-api-password}"

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-SQL
	CREATE USER IF NOT EXISTS 'siders_api'@'%' IDENTIFIED BY '${API_PASSWORD}';
	GRANT SELECT, INSERT, UPDATE, DELETE ON siders.* TO 'siders_api'@'%';
	FLUSH PRIVILEGES;
SQL
