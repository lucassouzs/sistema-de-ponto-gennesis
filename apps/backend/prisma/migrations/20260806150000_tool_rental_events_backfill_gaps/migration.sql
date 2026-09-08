-- Backfill: se o status atual da solicitação está à frente do último evento,
-- registra a transição faltante (ex.: OPEN → SUPPLIER_RELATION).

INSERT INTO "tool_rental_request_events" (
  "id",
  "requestId",
  "fromStatus",
  "toStatus",
  "note",
  "actorId",
  "createdAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || r."id" || r."status"::text),
  r."id",
  last_ev."toStatus",
  r."status",
  CASE r."status"
    WHEN 'SUPPLIER_RELATION' THEN COALESCE(
      NULLIF(TRIM(r."suppliesApprovalComment"), ''),
      'Encaminhada para Relação com o Fornecedor'
    )
    WHEN 'AWAITING_PAYMENT' THEN 'Espelho da OC anexado — aguardando pagamento'
    WHEN 'COMPLETED' THEN 'Comprovante de pagamento anexado — solicitação finalizada'
    WHEN 'REJECTED' THEN COALESCE(
      NULLIF(TRIM(r."suppliesRejectionReason"), ''),
      'Solicitação rejeitada'
    )
    WHEN 'CANCELLED' THEN 'Solicitação cancelada'
    ELSE 'Atualização de status'
  END,
  COALESCE(r."suppliesApprovedById", r."createdById"),
  COALESCE(r."suppliesApprovedAt", r."updatedAt", r."createdAt")
FROM "tool_rental_requests" r
INNER JOIN LATERAL (
  SELECT e."toStatus"
  FROM "tool_rental_request_events" e
  WHERE e."requestId" = r."id"
  ORDER BY e."createdAt" DESC, e."id" DESC
  LIMIT 1
) last_ev ON TRUE
WHERE r."status"::text <> last_ev."toStatus"::text;
