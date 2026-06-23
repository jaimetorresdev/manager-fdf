-- TransferOffer.releaseClause: Int → Float (alinea con Player.releaseClause, evita truncación)
ALTER TABLE "TransferOffer" ALTER COLUMN "releaseClause" TYPE DOUBLE PRECISION USING "releaseClause"::double precision;
