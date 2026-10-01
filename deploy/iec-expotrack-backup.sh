#!/bin/sh
set -eu

backup_dir=/var/backups/iec-expotrack
stamp=$(/usr/bin/date -u +%Y%m%dT%H%M%SZ)
temporary_path="$backup_dir/.iec-expotrack-$stamp.dump.tmp"
final_path="$backup_dir/iec-expotrack-$stamp.dump"

umask 077
/usr/bin/mkdir -p "$backup_dir"
trap '/usr/bin/rm -f "$temporary_path"' EXIT INT TERM
/usr/bin/docker exec iec-expotrack-db-1 pg_dump -U iec -d iec_expobot -Fc > "$temporary_path"
test -s "$temporary_path"
/usr/bin/mv "$temporary_path" "$final_path"
trap - EXIT INT TERM
/usr/bin/find "$backup_dir" -type f -name 'iec-expotrack-*.dump' -mtime +14 -delete
