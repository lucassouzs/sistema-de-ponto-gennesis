-- Renumerar entregas existentes para ID sequencial simples (1, 2, 3...)
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC)::text AS num
  FROM material_deliveries
)
UPDATE material_deliveries AS m
SET "deliveryNumber" = ordered.num
FROM ordered
WHERE m.id = ordered.id;
