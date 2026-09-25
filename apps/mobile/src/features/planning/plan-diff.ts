type Block = { activityId: string; startsAt: string; endsAt: string };

export type PlanBlockChange =
  | { kind: "added"; activityId: string; next: Block }
  | { kind: "moved"; activityId: string; previous: Block; next: Block }
  | { kind: "removed"; activityId: string; previous: Block };

const sameSlot = (left: Block, right: Block) =>
  left.activityId === right.activityId &&
  left.startsAt === right.startsAt &&
  left.endsAt === right.endsAt;

export function diffPlanBlocks(previous: Block[], next: Block[]): PlanBlockChange[] {
  const remainingPrevious = [...previous];
  const remainingNext = [...next];
  for (let nextIndex = remainingNext.length - 1; nextIndex >= 0; nextIndex -= 1) {
    const candidate = remainingNext[nextIndex];
    if (!candidate) continue;
    const previousIndex = remainingPrevious.findIndex((item) => sameSlot(item, candidate));
    if (previousIndex === -1) continue;
    remainingPrevious.splice(previousIndex, 1);
    remainingNext.splice(nextIndex, 1);
  }

  const changes: PlanBlockChange[] = [];
  const activityIds = new Set([
    ...remainingPrevious.map((item) => item.activityId),
    ...remainingNext.map((item) => item.activityId),
  ]);
  for (const activityId of activityIds) {
    const before = remainingPrevious
      .filter((item) => item.activityId === activityId)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    const after = remainingNext
      .filter((item) => item.activityId === activityId)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    const paired = Math.min(before.length, after.length);
    for (let index = 0; index < paired; index += 1) {
      const previousBlock = before[index];
      const nextBlock = after[index];
      if (previousBlock && nextBlock)
        changes.push({ kind: "moved", activityId, previous: previousBlock, next: nextBlock });
    }
    for (const nextBlock of after.slice(paired))
      changes.push({ kind: "added", activityId, next: nextBlock });
    for (const previousBlock of before.slice(paired))
      changes.push({ kind: "removed", activityId, previous: previousBlock });
  }
  return changes;
}
