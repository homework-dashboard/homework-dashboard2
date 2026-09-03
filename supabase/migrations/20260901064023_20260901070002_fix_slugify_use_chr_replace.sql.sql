/*
# Fix slugify: use replace() instead of translate()

1. Changes
- The `translate()` function with Cyrillic source strings gets corrupted
  when transmitted through the MCP migration tool, producing garbage slugs.
- Rewrite `slugify()` to use individual `replace()` calls for each
  Cyrillic character instead of `translate()`.
- Re-backfill all teacher and lesson slugs.

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

  -- Multi-character Cyrillic transliteration (before single-char)
  result := replace(result, chr(1078), 'zh');  -- ж
  result := replace(result, chr(1095), 'ch');  -- ч
  result := replace(result, chr(1096), 'sh');  -- ш
  result := replace(result, chr(1097), 'sch'); -- щ
  result := replace(result, chr(1102), 'yu');  -- ю
  result := replace(result, chr(1103), 'ya');  -- я
  result := replace(result, chr(1105), 'yo');  -- ё
  result := replace(result, chr(1098), '');    -- ъ
  result := replace(result, chr(1100), '');    -- ь

  -- Single-character Cyrillic transliteration
  result := replace(result, chr(1072), 'a');  -- а
  result := replace(result, chr(1073), 'b');  -- б
  result := replace(result, chr(1074), 'v');  -- в
  result := replace(result, chr(1075), 'g');  -- г
  result := replace(result, chr(1076), 'd');  -- д
  result := replace(result, chr(1077), 'e');  -- е
  result := replace(result, chr(1079), 'z');  -- з
  result := replace(result, chr(1080), 'i');  -- и
  result := replace(result, chr(1081), 'y');  -- й
  result := replace(result, chr(1082), 'k');  -- к
  result := replace(result, chr(1083), 'l');  -- л
  result := replace(result, chr(1084), 'm');  -- м
  result := replace(result, chr(1085), 'n');  -- н
  result := replace(result, chr(1086), 'o');  -- о
  result := replace(result, chr(1087), 'p');  -- п
  result := replace(result, chr(1088), 'r');  -- р
  result := replace(result, chr(1089), 's');  -- с
  result := replace(result, chr(1090), 't');  -- т
  result := replace(result, chr(1091), 'u');  -- у
  result := replace(result, chr(1092), 'f');  -- ф
  result := replace(result, chr(1093), 'h');  -- х
  result := replace(result, chr(1094), 'c');  -- ц
  result := replace(result, chr(1099), 'y');  -- ы
  result := replace(result, chr(1101), 'e');  -- э

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

-- Re-backfill teacher slugs
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

-- Re-backfill lesson slugs
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
