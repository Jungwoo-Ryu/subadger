"""
SQL snippets for `listings` alias `l`.

`listings.title` may be missing on older DBs (migration not applied). Using
`to_jsonb(l)->>'title'` avoids referencing a non-existent column while still
preferring title when the column exists and is non-empty.
"""

LISTING_DISPLAY_TITLE = """COALESCE(
  NULLIF(BTRIM(COALESCE(to_jsonb(l) ->> 'title', '')), ''),
  LEFT(COALESCE(l.address, ''), 80)
)"""
