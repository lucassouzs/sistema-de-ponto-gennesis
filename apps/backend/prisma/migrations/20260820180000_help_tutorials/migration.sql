-- CreateTable
CREATE TABLE IF NOT EXISTS "help_tutorials" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "href" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_tutorials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "help_tutorials_slug_key" ON "help_tutorials"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "help_tutorials_setor_idx" ON "help_tutorials"("setor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "help_tutorials_createdAt_idx" ON "help_tutorials"("createdAt");

-- AddForeignKey (ignore if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'help_tutorials_created_by_id_fkey'
  ) THEN
    ALTER TABLE "help_tutorials"
      ADD CONSTRAINT "help_tutorials_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
