export function downsampleSeries<T>(
  items: T[],
  maxPoints: number,
  getValue: (item: T) => number,
): T[] {
  if (items.length <= maxPoints || maxPoints < 3) {
    return items;
  }

  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const middle = items.slice(1, -1);
  const bucketSize = middle.length / bucketCount;
  const sampled: T[] = [items[0]];

  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor(index * bucketSize);
    const end =
      index === bucketCount - 1
        ? middle.length
        : Math.floor((index + 1) * bucketSize);
    const bucket = middle.slice(start, end);

    if (bucket.length === 0) {
      continue;
    }

    if (bucket.length === 1) {
      sampled.push(bucket[0]);
      continue;
    }

    let minItem = bucket[0];
    let maxItem = bucket[0];

    for (const item of bucket) {
      if (getValue(item) < getValue(minItem)) {
        minItem = item;
      }
      if (getValue(item) > getValue(maxItem)) {
        maxItem = item;
      }
    }

    const minIndex = bucket.indexOf(minItem);
    const maxIndex = bucket.indexOf(maxItem);
    const orderedItems =
      minIndex <= maxIndex ? [minItem, maxItem] : [maxItem, minItem];

    for (const item of orderedItems) {
      if (sampled[sampled.length - 1] !== item) {
        sampled.push(item);
      }
    }
  }

  const lastItem = items[items.length - 1];
  if (sampled[sampled.length - 1] !== lastItem) {
    sampled.push(lastItem);
  }

  return sampled;
}

export function getAxisInterval(
  pointsCount: number,
  targetTicks: number,
): number {
  if (pointsCount <= targetTicks) {
    return 0;
  }

  return Math.max(0, Math.ceil(pointsCount / targetTicks) - 1);
}
