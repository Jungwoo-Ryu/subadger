-- Allow 3 super likes per sender per UTC day (was 1).
-- The limit is now enforced in Python (router.py) with a COUNT check.
DROP INDEX IF EXISTS public.idx_super_likes_one_per_sender_day;
