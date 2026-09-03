/*
# Fix Cyrillic slug transliteration

1. Changes
- Replace the `slugify()` function with a corrected version that uses proper
  multi-character transliteration (e.g. ж→zh, ч→ch, ш→sh, щ→sch, ю→yu, я→ya).
- The old version used `translate()` which only does single-character
  replacement, producing wrong slugs for multi-letter sounds.
- Backfill all existing teacher and lesson slugs using the corrected function.
- Existing slugs are overwritten with the corrected versions; uniqueness is
  preserved by appending a numeric suffix when collisions occur.

2. Security
- No RLS or policy changes.
*/

CREATE OR REPLACE FUNCTION slugify(input text) RETURNS text AS $$
DECLARE
  result text;
BEGIN
  IF input IS NULL OR input = '' THEN
    RETURN 'untitled';
  END IF;

  result := lower(input);

  -- Multi-character Cyrillic transliteration (must be done before single-char)
  result := replace(result, 'ж', 'zh');
  result := replace(result, 'ч', 'ch');
  result := replace(result, 'ш', 'sh');
  result := replace(result, 'щ', 'sch');
  result := replace(result, 'ю', 'yu');
  result := replace(result, 'я', 'ya');
  result := replace(result, 'ё', 'yo');
  result := replace(result, 'ъ', '');
  result := replace(result, 'ь', '');

  -- Single-character Cyrillic transliteration
  result := translate(result,
    'абвгдезийклмнопрстуфхцыэ',
    'abvgdezijklmnoprstufhcy e');

  -- Replace spaces and non-alphanumeric with hyphens
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');

  -- Trim leading/trailing hyphens
  result := trim(both '-' from result);

  IF result = '' THEN
    result := 'untitled';
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill teacher slugs with corrected transliteration
DO $$
DECLARE
  t_rec RECORD;
  base_slug text;
  final_slug text;
  counter int;
BEGIN
  FOR t_rec IN SELECT id, name FROM teachers LOOP
    base_slug := slugify(t_rec.name);
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM teachers WHERE slug = final_slug AND id <> t_rec.id) LOOP
      final_slug := base_slug || '-' || counter::text;
      counter := counter + 1;
    END LOOP;
    UPDATE teachers SET slug = final_slug WHERE id = t_rec.id;
  END LOOP;
END $$;

-- Backfill lesson slugs with corrected transliteration
DO $$
DECLARE
  l_rec RECORD;
  base_slug text;
  final_slug text;
  counter int;
  weekday_names text[] := ARRAY['voskresene','ponedelnik','vtornik','sreda','chetver','pyatnitsa','subbota'];
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
