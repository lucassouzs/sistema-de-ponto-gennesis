-- dataUsoInicio / dataUsoFim passam a guardar horário também
ALTER TABLE "vehicle_reservations" ALTER COLUMN "dataUsoInicio" TYPE TIMESTAMP(3) USING ("dataUsoInicio"::timestamp);
ALTER TABLE "vehicle_reservations" ALTER COLUMN "dataUsoFim" TYPE TIMESTAMP(3) USING ("dataUsoFim"::timestamp);
