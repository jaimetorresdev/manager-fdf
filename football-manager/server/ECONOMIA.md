# Macroeconomía Dinámica y Subastas (Fase 6)

Este documento describe las mecánicas macroeconómicas de inflación y los modelos de datos para subastas introducidos en la Fase 6.

## 1. Inflación por Demanda Agregada

El juego simula una economía viva donde los precios de los jugadores (`marketValue`, `salary`, `releaseClause`) fluctúan dependiendo de la actividad general de los mánagers en el mercado.

### Fórmula de Demanda Agregada

En cada Tick, el motor calcula la **Demanda Total** sumando el valor económico (`amount`) de las siguientes operaciones producidas en los **últimos 30 días** dentro del juego:

- Ofertas de traspaso directas (`TransferOffer`)
- Negociaciones entre clubes (`TransferAgreement`)
- Pujas en subastas (`AuctionBid`)

$$
D_{total} = \sum TransferOffers + \sum TransferAgreements + \sum AuctionBids
$$

### Índice de Inflación

Para evitar cambios bruscos, el juego presupone una Demanda Esperada ($D_{esperada}$) base, que se define como 10M por club. 

El Factor de Demanda se calcula como:

$$
Factor_{demanda} = \frac{D_{total}}{D_{esperada}}
$$

Si el Factor de Demanda es mayor que 1.0, el mercado está *caliente* (alta actividad) y los precios subirán. Si es menor, el mercado está *frío* y habrá deflación.

Para suavizar las fluctuaciones, la variación mensual máxima permitida (K-factor) es del 5%:

$$
\Delta_{inflacion} = (Factor_{demanda} - 1.0) \times 0.05
$$

El nuevo Índice de Inflación será el antiguo más el delta, acotado entre un mínimo de 0.8 (-20% deflación extrema) y un máximo de 1.5 (+50% inflación extrema).

$$
Indice_{nuevo} = \max(0.8, \min(1.5, Indice_{antiguo} + \Delta_{inflacion}))
$$

### Aplicación en el Tick

Al finalizar cada Tick, se reajustan los valores base de todos los jugadores multiplicándolos por el incremento o decremento de la inflación respecto al último cálculo:

$$
Multiplicador = \frac{Indice_{nuevo}}{Indice_{antiguo}}
$$

$$
Valor_{nuevo} = \text{ROUND}(Valor_{antiguo} \times Multiplicador)
$$

Esto afecta a `marketValue`, `salary` y `releaseClause`.

---

## 2. Soporte Multijugador (Codex)

Se han añadido tres modelos a Prisma que Codex utilizará para implementar las interfaces multijugador:

### `Auction` (Subastas)
- **`playerId`**: Jugador en subasta.
- **`sellerClubId`**: Club que pone el jugador en venta.
- **`startPrice`**: Precio inicial (Float).
- **`status`**: `active`, `finished`, `cancelled`.
- **`endsAt`**: Fecha de finalización.

### `AuctionBid` (Pujas)
- **`auctionId`**: Subasta objetivo.
- **`managerId`**: Mánager que hace la puja (en representación de su club).
- **`amount`**: Cantidad ofertada.

### `TransferAgreement` (Negociaciones Formales)
Para negociaciones en varias fases entre dos clubes:
- **`fromClubId`** y **`toClubId`**: Clubes involucrados.
- **`amount`**: Dinero.
- **`type`**: `transfer`, `loan`, `exchange`.
- **`status`**: Flujo de estado (`draft` -> `proposed` -> `accepted` / `rejected`).
