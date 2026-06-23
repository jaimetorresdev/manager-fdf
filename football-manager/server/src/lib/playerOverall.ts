export type PlayerAttrs = {
  passing: number;
  tackling: number;
  shooting: number;
  organization: number;
  unmarking: number;
  finishing: number;
  dribbling: number;
  goalkeeping: number;
};

export function playerOverall(player: PlayerAttrs): number {
  return Math.round((
    player.passing +
    player.tackling +
    player.shooting +
    player.organization +
    player.unmarking +
    player.finishing +
    player.dribbling +
    player.goalkeeping
  ) / 8);
}
