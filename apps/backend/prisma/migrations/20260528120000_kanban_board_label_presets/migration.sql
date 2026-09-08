-- Etiquetas configuráveis por quadro/setor
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "label_presets" JSONB NOT NULL DEFAULT '[]';

UPDATE "kanban_boards"
SET "label_presets" = '[
  {"color":"#FF78CB","name":"DP/RH"},
  {"color":"#00C2E0","name":"Sistema"},
  {"color":"#FF9F1A","name":"Engenharia"},
  {"color":"#F2D600","name":"Suprimentos"},
  {"color":"#C377E0","name":"Contratos e Licitações"},
  {"color":"#51E898","name":"Projetos"},
  {"color":"#EB5A46","name":"Diretoria/Auditoria"},
  {"color":"#344563","name":"Editavel","editable":true}
]'::jsonb
WHERE "label_presets" = '[]'::jsonb OR jsonb_array_length("label_presets") = 0;
