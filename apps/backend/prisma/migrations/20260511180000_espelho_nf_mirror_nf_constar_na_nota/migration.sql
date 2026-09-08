-- Espelho NF: seleção de campos opcionais a exibir no formulário ("Constar na nota fiscal")
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "nfConstarNaNota" JSONB;
