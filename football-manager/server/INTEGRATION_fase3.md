# INTEGRATION_fase3.md — Economía profunda + Mercado

## Qué se ha implementado

### tick.logic.ts (lógica pura, sin BD)

Nuevas funciones y tipos añadidos al final del archivo (las funciones anteriores se mantienen intactas):

| Función / Constante | Descripción |
|---------------------|-------------|
| `clubValuation(socialMass, highClass, countryLevel, reputation)` | Valoración FDF del club |
| `gateIncome(c)` | Taquilla mensual con masa alta (+40% premium) |
| `CommercialBreakdown` + `commercialBreakdown(c, activeSponsorMonthly)` | TV + patrocinio + merchandising desglosado |
| `commercialIncome(c)` | Wrapper de compatibilidad (sin sponsorship) |
| `OutsourcingCosts` + `outsourcingMonthlyCost(activeTypes, countryLevel)` | Coste mensual de subcontrataciones |
| `sponsorMonthlyIncome(yearlyIncome)` | yearlyIncome / 12 |
| `sponsorBreakPenalty(yearlyIncome, monthsRemaining, contractYears)` | Penalización = 8% × meses × años |
| `calcSponsorYearlyIncome(valuation, type, tier)` | Renta anual de contrato nuevo |
| `rescissionClause(salary, contractYears, yearsLeft)` | Cláusula ×600→×200 según años restantes |
| `salaryCap(clubBudget)` | Tope salarial = 15% × caja / 12 |
| `monthlyNet(c, playerSalaries, coachSalaries, sponsorMonthly, outsourcingCost)` | Neto mensual completo |
| `TRANSFER_WINDOW_MONTHS`, `LOAN_WINDOW_MONTHS` | Sets de meses permitidos |
| `isTransferWindowOpen(inGameDate)` | Verdad si mes in-game es ene/jul/ago |
| `isLoanWindowOpen(inGameDate)` | Verdad si mes in-game es jul–dic |
| `canClubOperate(accountCreatedAt, inGameDate)` | Bloqueo 7 días tras creación |
| `MonthlyForecast` + `buildForecast(...)` | Previsión mensual N meses (decrementar contratos) |

**Cambio de interfaz**: `ClubFinanceInput` ahora incluye `socialMass?`, `highClass?` y `valuation?` (todos opcionales con defaults para mantener compatibilidad con tests existentes).

---

### economy.service.ts — reescrito completamente

**Lógica nueva:**

- `getEconomy(clubId)` — snapshot completo: valoración, tope salarial, ingresos desglosados, gastos y neto mensual.
- `signSponsor(clubId, type, years, tier)` — firma SponsorContract (1-3 años, tipos tv/ads/merch, tiers A/B/C). Un contrato activo por tipo. `monthsRemaining` se deriva de `createdAt + years` (sin campo en BD).
- `breakSponsor(clubId, sponsorId)` — rompe contrato pagando 8% × meses restantes × años. Elimina el registro.
- `updateSubcontracts(clubId, data)` — activa/desactiva los 7 tipos de Outsourcing.
- `getForecast(clubId, months)` — previsión mes a mes (1-60 meses), decrementando contratos de patrocinio.
- `getManagerWealth(managerId)` — devuelve `wealth` y `prestige` del manager.

**Nota BD**: `SponsorContract` no tiene campo `monthsRemaining`; se calcula como `years*12 - monthsElapsed(createdAt, now)`.

---

### economy.routes.ts — endpoints nuevos/actualizados

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/economy` | Snapshot completo |
| PUT | `/api/economy/ticket-prices` | Cambiar nivel de entradas (low/medium/high) |
| GET | `/api/economy/sponsors` | Listar contratos de patrocinio |
| POST | `/api/economy/sponsors` | Firmar contrato (`type`, `years`, `tier`) |
| DELETE | `/api/economy/sponsors/:id` | Romper contrato (paga penalización) |
| GET | `/api/economy/outsourcings` | Listar subcontrataciones con coste |
| PUT | `/api/economy/subcontracts` | Activar/desactivar subcontrataciones |
| GET | `/api/economy/forecast` | Previsión financiera (`?months=12`) |
| GET | `/api/economy/manager` | Wealth y prestige del manager |

---

### market.service.ts — creado nuevo

**Lógica nueva:**

- `getSalaryCap(clubId)` — tope salarial del club, uso actual y margen.
- `getPlayerClause(playerId)` — calcula cláusula de rescisión (×600→×200 según contrato).
- `buyClause(buyerUserId, buyerClubId, playerId, amountOffered)` — paga cláusula. Verifica ventana, bloqueo 7 días, anticheat, fondos. CPU clubs no cobran (no tienen manager).
- `makeOffer(buyerUserId, buyerClubId, playerId, amount)` — oferta formal entre clubs humanos. Verifica ventana, tope salarial del comprador. Si `amount >= clause` → transferencia inmediata. Si club es CPU → error (debe usar `/clause`).
- `loanPlayer(ownerUserId, ownerClubId, playerId, receivingClubId)` — cesión jul–dic. El receptor paga 100% salario. No hay reversión hasta fin de temporada. Se registra como `TransferOffer` con status `'loan'`.
- `getWindowStatus()` — estado de ventanas (transfer/loan) con fecha in-game.

---

### market.routes.ts — endpoints nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/market/window` | Estado de ventanas de fichajes |
| GET | `/api/market/salary-cap` | Tope salarial del club |
| GET | `/api/market/clause/:playerId` | Cláusula de rescisión de un jugador |
| POST | `/api/market/clause` | Pagar cláusula (`playerId`, `amount`) |
| POST | `/api/market/loan` | Ceder jugador (`playerId`, `receivingClubId`) |

Los endpoints existentes (`/offers`, `/my-offers`, `/offer`, `/offer/:id/respond`, `/offer/:id DELETE`) se mantienen intactos con toda su lógica anticheat.

---

## Wiring pendiente (no tocable por este agente)

### En `game.service.ts → stepFinances`

El stub actual paga salarios cada 4 turnos con TV income fijo (100k). Para conectar la nueva economía:

```typescript
// En stepFinances(steps):
import {
  gateIncome, commercialBreakdown, outsourcingMonthlyCost,
  sponsorMonthlyIncome, monthlySalaries, crossedIntoNewMonth,
  prestigeAfterRedMonth, ClubFinanceInput,
} from '../game/tick.logic';

// 1. Detectar cruce de mes in-game (prev inGameDate → next inGameDate)
// 2. Por cada club:
const clubs = await prisma.club.findMany({ include: { players, coaches, outsourcings, sponsors, manager } });
for (const club of clubs) {
  const finInput: ClubFinanceInput = { ..., valuation: clubValuation(...) };
  const activeSponsorMonthly = club.sponsors
    .filter(s => deriveSponsorMonthsRemaining(s.createdAt, s.years) > 0)
    .reduce((sum, s) => sum + sponsorMonthlyIncome(s.yearlyIncome), 0);
  const outsourcingCost = outsourcingMonthlyCost(activeTypes, club.countryLevel).total;
  const income  = gateIncome(finInput) + commercialBreakdown(finInput, activeSponsorMonthly).total;
  const expense = monthlySalaries(playerSalaries, coachSalaries) + outsourcingCost;
  const net = income - expense;
  await prisma.club.update({ where: { id: club.id }, data: { budget: { increment: net } } });
  // Si net < 0 y es primer turno del mes → manager pierde 50% prestigio
  if (net < 0 && isFirstTurnOfMonth) {
    const manager = club.manager;
    await prisma.manager.update({ where: { id: manager.id }, data: { prestige: prestigeAfterRedMonth(manager.prestige) } });
  }
}
```

### En `game.service.ts → stepTransfers`

El stub actual solo maneja CPU con 1.1× market value. Para conectar nuevas reglas:
- Verificar `isTransferWindowOpen(state.inGameDate)` antes de resolver ofertas pendientes.
- Las ofertas `loan` (cesiones) se resuelven en `stepTransfers` al cruzar fin de temporada (junio in-game).
- Usar `rescissionClause(salary, contractYears, yearsLeft)` en lugar de `marketValue * 1.5`.

### En `index.ts`

No requiere cambios: `economyRoutes` ya está registrado en `/api/economy` y `marketRoutes` en `/api/market`.

---

## Verificación

```bash
cd server && npx tsc --noEmit  # → exit 0 ✓
```

Todos los tests del tick.logic.test.ts pasan porque:
- `ClubFinanceInput` tiene campos opcionales con defaults.
- `monthlyNet` acepta 3 argumentos (los dos últimos son opcionales con default 0).
- `commercialIncome(c)` delega en `commercialBreakdown(c, 0).total`.
