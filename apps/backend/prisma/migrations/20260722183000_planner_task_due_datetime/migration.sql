-- AlterTable: data da tarefa passa a guardar horário também
ALTER TABLE "planner_tasks" ALTER COLUMN "dueDate" TYPE TIMESTAMP(3) USING (
  CASE
    WHEN "dueDate" IS NULL THEN NULL
    ELSE ("dueDate"::timestamp)
  END
);
