-- N4-3: legacyAttributes en YouthAcademy
-- JSON con los 3 mejores atributos de la última leyenda retirada con ≥450 partidos en el club.
-- Campo opcional (NULL = sin leyenda aún). Additive — no rompe datos existentes.
ALTER TABLE "YouthAcademy" ADD COLUMN "legacyAttributes" TEXT;
