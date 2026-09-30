-- TRINITY OS problem-image bucket (private; Worker service_role proxy only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trinity-problem-images',
  'trinity-problem-images',
  false,
  2097152,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
