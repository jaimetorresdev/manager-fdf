-- WT1/WT2 (11 jun 2026 — Claude) · Tácticas Pro: posiciones detalladas + roles.
-- TODO ADITIVO: columnas nuevas nullable, cero renombrados, cero drops.

-- WT1 · Player.detailedPosition (15 posiciones reales; la macro position NO se toca)
ALTER TABLE "Player" ADD COLUMN "detailedPosition" TEXT;

CREATE INDEX "Player_detailedPosition_idx" ON "Player"("detailedPosition");

-- WT2 · Tactic.roleInstructions (roles modernos por hueco, JSON aditivo)
ALTER TABLE "Tactic" ADD COLUMN "roleInstructions" TEXT;

-- ─── WT1 · BACKFILL por derivación de atributos (doc de diseño §1 y §1.1) ─────
-- Determinista y documentado. Tres pasadas:
--   1) strings detallados LEGACY del seed (PO/DFC/MC/MD/MI/EXT…) → mapeo directo;
--   2) macros (POR/DEF/MED/DEL) → derivación por perfil de atributos;
--   3) red de seguridad: lo que quede → derivación por macro normalizada.
-- Lado izq/dcho estable por paridad de squadNumber (fallback id): par → derecho.

-- 1) Mapeo directo de strings detallados legacy.
UPDATE "Player" SET "detailedPosition" = CASE UPPER(TRIM(position))
  WHEN 'PO'  THEN 'POR'
  WHEN 'GK'  THEN 'POR'
  WHEN 'DFC' THEN 'CT'
  WHEN 'LD'  THEN 'LD'
  WHEN 'LI'  THEN 'LI'
  WHEN 'PIV' THEN 'PIV'
  WHEN 'MC'  THEN 'ORG'
  WHEN 'MCO' THEN 'MCO'
  WHEN 'MD'  THEN 'INTD'
  WHEN 'MI'  THEN 'INTI'
  WHEN 'EXT DERECHA' THEN 'EXTD'
  WHEN 'EXT IZQ'     THEN 'EXTI'
  WHEN 'DC'  THEN 'DC'
  ELSE NULL
END
WHERE "detailedPosition" IS NULL
  AND UPPER(TRIM(position)) IN ('PO','GK','DFC','LD','LI','PIV','MC','MCO','MD','MI','EXT DERECHA','EXT IZQ','DC');

-- 2a) POR macro.
UPDATE "Player" SET "detailedPosition" = 'POR'
WHERE "detailedPosition" IS NULL AND UPPER(TRIM(position)) = 'POR';

-- 2b) DEF: tackling+organization altos → CT; dribbling/passing altos → lateral
--     (lado por paridad). Regla del doc §1.
UPDATE "Player" SET "detailedPosition" = CASE
  WHEN (dribbling + passing) > (tackling + organization)
    THEN CASE WHEN MOD(ABS(COALESCE("squadNumber", id)), 2) = 0 THEN 'LD' ELSE 'LI' END
  ELSE 'CT'
END
WHERE "detailedPosition" IS NULL AND UPPER(TRIM(position)) = 'DEF';

-- 2c) MED: dribbling alto → interior (lado) · tackling dominante → PIV ·
--     finishing/tiro alto → MCO · passing+organization → ORG · plano con
--     consistency → BOX · desmarque alto → MP. Reglas del doc §1.
UPDATE "Player" SET "detailedPosition" = CASE
  WHEN dribbling >= GREATEST(passing, organization, tackling)
    THEN CASE WHEN MOD(ABS(COALESCE("squadNumber", id)), 2) = 0 THEN 'INTD' ELSE 'INTI' END
  WHEN tackling >= GREATEST(passing, organization)
    THEN 'PIV'
  WHEN unmarking >= GREATEST(passing, organization)
    THEN 'MP'
  WHEN (shooting + finishing) / 2 >= organization
    THEN 'MCO'
  WHEN ABS(passing - organization) <= 6 AND consistency >= 60
    THEN 'BOX'
  ELSE 'ORG'
END
WHERE "detailedPosition" IS NULL AND UPPER(TRIM(position)) = 'MED';

-- 2d) DEL: dribbling+unmarking → extremo (lado) · passing+unmarking → F9 ·
--     finishing puro → DC. Reglas del doc §1.
UPDATE "Player" SET "detailedPosition" = CASE
  WHEN (dribbling + unmarking) > (finishing + shooting)
    THEN CASE WHEN MOD(ABS(COALESCE("squadNumber", id)), 2) = 0 THEN 'EXTD' ELSE 'EXTI' END
  WHEN passing >= finishing
    THEN 'F9'
  ELSE 'DC'
END
WHERE "detailedPosition" IS NULL AND UPPER(TRIM(position)) = 'DEL';

-- 3) Red de seguridad para cualquier string raro restante: macro normalizada
--    por familias y derivación mínima (CT/ORG/DC neutros, POR para porteros).
UPDATE "Player" SET "detailedPosition" = CASE
  WHEN goalkeeping >= 60 THEN 'POR'
  WHEN tackling >= GREATEST(passing, finishing) THEN 'CT'
  WHEN finishing >= passing THEN 'DC'
  ELSE 'ORG'
END
WHERE "detailedPosition" IS NULL;
