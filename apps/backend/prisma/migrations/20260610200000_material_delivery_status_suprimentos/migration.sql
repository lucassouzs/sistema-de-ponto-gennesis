-- OC finalizada não significa entrega concluída; corrigir registros marcados como ENTREGUE sem recebimento.
UPDATE "material_deliveries"
SET "currentStatus" = 'APROVADO_SUPRIMENTOS'
WHERE
  "receivedByEngineering" = false
  AND "currentStatus" = 'ENTREGUE';
