-- ═══════════════════════════════════════════════════════════════════
-- 008_lock_study_guides.sql
--
-- Creates a PRIVATE Supabase Storage bucket named "study-guides" and
-- locks read access to it behind active premium subscriptions only.
--
-- After running this migration:
--   1. Open Supabase Dashboard → Storage → "study-guides"
--   2. Create one folder per subject (mathematics/, english/, …)
--   3. Drag-and-drop each PDF.  The object key (e.g.
--      "mathematics/jamb-master-guide.pdf") goes into js/config.js
--      under STUDY_GUIDES[subject][i].path
--
-- The bucket is non-public, so direct URLs (CDN / share links) will
-- 404.  The study-guides page calls createSignedUrl() per click; the
-- RLS policy below decides whether the signed URL is issued.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Create / ensure the bucket exists and is PRIVATE ────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('study-guides', 'study-guides', false)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      name   = EXCLUDED.name;

-- ── 2. RLS policies on storage.objects ─────────────────────────────
-- Drop any prior versions so this migration is re-runnable.
DROP POLICY IF EXISTS "study_guides_premium_read"  ON storage.objects;
DROP POLICY IF EXISTS "study_guides_admin_write"   ON storage.objects;
DROP POLICY IF EXISTS "study_guides_admin_update"  ON storage.objects;
DROP POLICY IF EXISTS "study_guides_admin_delete"  ON storage.objects;

-- READ: any signed-in profile with an ACTIVE premium subscription
-- (or admins) may read every object in the bucket.
CREATE POLICY "study_guides_premium_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'study-guides'
    AND EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (
              p.is_admin = true
           OR (
                p.is_premium = true
                AND (p.subscription_expiry IS NULL
                     OR p.subscription_expiry > now())
              )
         )
    )
  );

-- WRITE / UPDATE / DELETE: admins only.  (Most teams will just
-- upload via the Supabase dashboard with the service-role key, which
-- bypasses RLS — but defining these policies explicitly closes the
-- door against any anon/authenticated upload attempts.)
CREATE POLICY "study_guides_admin_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'study-guides'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

CREATE POLICY "study_guides_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'study-guides'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

CREATE POLICY "study_guides_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'study-guides'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );
