export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

export type NamedCount = {
  label: string;
  value: number;
};

export type DailyPoint = {
  date: string;
  cases: number;
  highCritical: number;
  distressHigh: number;
  selfHarm: number;
  referrals: number;
};

export type GeoCell = {
  key: string;
  lat: number;
  lon: number;
  count: number;
};

const LOCAL_OFFSET_HOURS = -6;
const GEO_GRID_DEGREES = 0.01;

function localDateParts(value: string | Date) {
  const date = new Date(value);
  const shifted = new Date(
    date.getTime() +
      LOCAL_OFFSET_HOURS * 60 * 60 * 1000
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekDay: shifted.getUTCDay(),
  };
}

function fromLocalParts(
  year: number,
  month: number,
  day: number,
  hour = 0
) {
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      hour - LOCAL_OFFSET_HOURS,
      0,
      0,
      0
    )
  );
}

export function analyticsStart(
  period: AnalyticsPeriod,
  now = new Date()
) {
  if (period === 'all') return null;

  const p = localDateParts(now);

  if (period === 'day') {
    return fromLocalParts(
      p.year,
      p.month,
      p.day
    );
  }

  if (period === 'week') {
    const mondayOffset =
      p.weekDay === 0
        ? 6
        : p.weekDay - 1;

    const localMidnight = fromLocalParts(
      p.year,
      p.month,
      p.day
    );

    return new Date(
      localMidnight.getTime() -
        mondayOffset *
          24 *
          60 *
          60 *
          1000
    );
  }

  if (period === 'month') {
    return fromLocalParts(
      p.year,
      p.month,
      1
    );
  }

  return fromLocalParts(
    p.year,
    0,
    1
  );
}

export function periodLabel(
  period: AnalyticsPeriod
) {
  const labels: Record<
    AnalyticsPeriod,
    string
  > = {
    day: 'Hoy',
    week: 'Semana actual',
    month: 'Mes actual',
    year: 'Año actual',
    all: 'Histórico',
  };

  return labels[period];
}

export function isoDay(
  value: string | Date
) {
  const p = localDateParts(value);

  return [
    p.year,
    String(p.month + 1).padStart(
      2,
      '0'
    ),
    String(p.day).padStart(2, '0'),
  ].join('-');
}

export function localHour(
  value: string | Date
) {
  return localDateParts(value).hour;
}

export function localWeekDay(
  value: string | Date
) {
  return localDateParts(value).weekDay;
}

export function countBy(
  values: Array<string | null | undefined>,
  emptyLabel = 'Sin dato'
): NamedCount[] {
  const map = new Map<
    string,
    number
  >();

  for (const raw of values) {
    const label =
      String(raw || '').trim() ||
      emptyLabel;

    map.set(
      label,
      (map.get(label) || 0) + 1
    );
  }

  return [...map.entries()]
    .map(([label, value]) => ({
      label,
      value,
    }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.label.localeCompare(b.label)
    );
}

export function countArrayValues(
  arrays: Array<
    string[] | null | undefined
  >
): NamedCount[] {
  const map = new Map<
    string,
    number
  >();

  for (const values of arrays) {
    const unique = new Set(
      (values || [])
        .map((item) =>
          String(item).trim()
        )
        .filter(Boolean)
    );

    for (const value of unique) {
      map.set(
        value,
        (map.get(value) || 0) + 1
      );
    }
  }

  return [...map.entries()]
    .map(([label, value]) => ({
      label,
      value,
    }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.label.localeCompare(b.label)
    );
}

export function median(
  values: number[]
) {
  const clean = values
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= 0
    )
    .sort((a, b) => a - b);

  if (!clean.length) return null;

  const middle = Math.floor(
    clean.length / 2
  );

  if (clean.length % 2) {
    return clean[middle];
  }

  return (
    (clean[middle - 1] +
      clean[middle]) /
    2
  );
}

export function minutesBetween(
  from?: string | null,
  to?: string | null
) {
  if (!from || !to) return null;

  const value =
    (+new Date(to) -
      +new Date(from)) /
    60000;

  return Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

export function formatMinutes(
  value: number | null
) {
  if (value == null) return '—';

  if (value < 60) {
    return `${Math.round(value)} min`;
  }

  if (value < 24 * 60) {
    return `${(
      value / 60
    ).toFixed(1)} h`;
  }

  return `${(
    value /
    (24 * 60)
  ).toFixed(1)} días`;
}

export function buildDailySeries(args: {
  conversations: any[];
  maxRiskByConversation: Map<
    string,
    string
  >;
  maxDistressByConversation: Map<
    string,
    string
  >;
  maxSelfHarmByConversation: Map<
    string,
    string
  >;
  referrals: any[];
}) {
  const dates = new Set<string>();
  const map = new Map<
    string,
    DailyPoint
  >();

  function ensure(date: string) {
    dates.add(date);

    if (!map.has(date)) {
      map.set(date, {
        date,
        cases: 0,
        highCritical: 0,
        distressHigh: 0,
        selfHarm: 0,
        referrals: 0,
      });
    }

    return map.get(date)!;
  }

  for (const conversation of args.conversations) {
    const date = isoDay(
      conversation.created_at
    );

    const row = ensure(date);
    row.cases += 1;

    if (
      ['high', 'critical'].includes(
        args.maxRiskByConversation.get(
          conversation.id
        ) || 'none'
      )
    ) {
      row.highCritical += 1;
    }

    if (
      ['high', 'severe'].includes(
        args.maxDistressByConversation.get(
          conversation.id
        ) || 'none'
      )
    ) {
      row.distressHigh += 1;
    }

    if (
      [
        'concern',
        'high',
        'imminent',
      ].includes(
        args.maxSelfHarmByConversation.get(
          conversation.id
        ) || 'none'
      )
    ) {
      row.selfHarm += 1;
    }
  }

  for (const referral of args.referrals) {
    const date = isoDay(
      referral.created_at
    );

    ensure(date).referrals += 1;
  }

  return [...dates]
    .sort()
    .map((date) => map.get(date)!);
}

export function maxLevelByConversation(
  events: any[],
  field: string,
  rank: Record<string, number>
) {
  const result = new Map<
    string,
    string
  >();

  for (const event of events) {
    const id =
      event.conversation_id;
    const level =
      String(event[field] || 'none');
    const previous =
      result.get(id) || 'none';

    if (
      (rank[level] || 0) >
      (rank[previous] || 0)
    ) {
      result.set(id, level);
    } else if (!result.has(id)) {
      result.set(id, previous);
    }
  }

  return result;
}

export function coarseGeoCells(
  locations: any[],
  minGroupSize = 5
) {
  const cells = new Map<
    string,
    {
      lat: number;
      lon: number;
      conversationIds: Set<string>;
    }
  >();

  for (const location of locations) {
    const lat =
      Number(location.latitude);
    const lon =
      Number(location.longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }

    const latCell =
      Math.round(
        lat / GEO_GRID_DEGREES
      ) * GEO_GRID_DEGREES;

    const lonCell =
      Math.round(
        lon / GEO_GRID_DEGREES
      ) * GEO_GRID_DEGREES;

    const key = `${latCell.toFixed(
      2
    )},${lonCell.toFixed(2)}`;

    if (!cells.has(key)) {
      cells.set(key, {
        lat:
          latCell +
          GEO_GRID_DEGREES / 2,
        lon:
          lonCell +
          GEO_GRID_DEGREES / 2,
        conversationIds:
          new Set<string>(),
      });
    }

    cells
      .get(key)!
      .conversationIds.add(
        String(
          location.conversation_id
        )
      );
  }

  const visible: GeoCell[] = [];
  let suppressedCases = 0;

  for (const [key, cell] of cells) {
    const count =
      cell.conversationIds.size;

    if (count < minGroupSize) {
      suppressedCases += count;
      continue;
    }

    visible.push({
      key,
      lat: cell.lat,
      lon: cell.lon,
      count,
    });
  }

  return {
    visible: visible.sort(
      (a, b) => b.count - a.count
    ),
    suppressedCases,
    gridDegrees:
      GEO_GRID_DEGREES,
    approximateKm: 1.1,
  };
}

export function privacyFilteredAreas(
  values: NamedCount[],
  minGroupSize: number
) {
  const visible =
    values.filter(
      (item) =>
        item.label !== 'Sin dato' &&
        item.value >= minGroupSize
    );

  const suppressed = values
    .filter(
      (item) =>
        item.label !== 'Sin dato' &&
        item.value < minGroupSize
    )
    .reduce(
      (sum, item) =>
        sum + item.value,
      0
    );

  return {
    visible,
    suppressed,
  };
}

export function csvEscape(
  value: unknown
) {
  const text =
    value == null
      ? ''
      : String(value);

  if (
    /[",\n\r]/.test(text)
  ) {
    return `"${text.replace(
      /"/g,
      '""'
    )}"`;
  }

  return text;
}
