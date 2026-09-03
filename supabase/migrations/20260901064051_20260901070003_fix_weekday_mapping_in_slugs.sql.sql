/*
# Fix weekday name mapping in slug generation

1. Changes
- The weekday_names array in slugify trigger functions was off by one:
  weekday=1 (Понедельник/Monday) mapped to "voskresene" (Sunday) instead of
  "ponedelnik".
- Fix: reorder the array to match the WEEKDAYS constant in the frontend:
    1=ponedelnik, 2=vtornik, 3=sreda, 4=chetver, 5=pyatnitsa, 6=subbota, 7=voskresene
- Update both the trigger function `set_lesson_slug()` and the backfill.
- Re-backfill all lesson slugs with corrected weekday names.

2. Security
- No RLS or policy changes.
*/

CREATE OR REPLACE FUNCTION set_lesson_slug() RETURNS trigger AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter int;
  weekday_names text[] := ARRAY['ponedelnik','vtornik','sreda','chetver','pyatnitsa','subbota','voskresene'];
  wd_name text;
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.weekday IS NOT NULL AND NEW.weekday >= 1 AND NEW.weekday <= 7 THEN
    wd_name := weekday_names[NEW.weekday];
  ELSE
    wd_name := 'urok';
  END IF;
  base_slug := slugify(wd_name || '-' || COALESCE(NEW.class_name, ''));
  final_slug := base_slug;
  counter := 1;
  WHILE EXISTS (SELECT 1 FROM lessons WHERE slug = final_slug AND id <> NEW.id) LOOP
    final_slug := base_slug || '-' || counter::text;
    counter := counter + 1;
  END LOOP;
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-backfill lesson slugs with corrected weekday mapping
DO $$
DECLARE
  l_rec RECORD;
  base_slug text;
  final_slug text;
  counter int;
  weekday_names text[] := ARRAY['ponedelnik','vtornik','sreda','chetver','pyatnitsa','subbota','voskresene'];
  wd_name text;
BEGIN
  FOR l_rec IN SELECT id, weekday, class_name FROM lessons LOOP
    IF l_rec.weekday IS NOT NULL AND l_rec.weekday >= 1 AND l_rec.weekday <= 7 THEN
      wd_name := weekday_names[l_rec.weekday];
    ELSE
      wd_name := 'urok';
    END IF;
    base_slug := slugify(wd_name || '-' || COALESCE(l_rec.class_name, ''));
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM lessons WHERE slug = final_slug AND id <> l_rec.id) LOOP
      final_slug := base_slug || '-' || counter::text;
      counter := counter + 1;
    END LOOP;
    UPDATE lessons SET slug = final_slug WHERE id = l_rec.id;
  END LOOP;
END $$;
