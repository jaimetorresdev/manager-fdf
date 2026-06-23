import { progressionAttributeCeiling } from '../game/playerProgression.rules';

export const INSPECTABLE_PLAYER_ATTRIBUTES = [
  'passing',
  'tackling',
  'shooting',
  'organization',
  'unmarking',
  'finishing',
  'dribbling',
  'fouls',
  'goalkeeping',
  'reflexes',
] as const;

type InspectableAttribute = typeof INSPECTABLE_PLAYER_ATTRIBUTES[number];
type InspectablePlayer = {
  age: number;
  potential: number;
} & Record<InspectableAttribute, number>;

export function revealablePlayerAttributes(player: InspectablePlayer): InspectableAttribute[] {
  const ceiling = progressionAttributeCeiling(player);
  return INSPECTABLE_PLAYER_ATTRIBUTES.filter((attribute) => player[attribute] < ceiling);
}
