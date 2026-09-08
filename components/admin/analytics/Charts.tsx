import type {
  DailyPoint,
  GeoCell,
  NamedCount,
} from '@/lib/analytics/aggregate';

function maxValue(
  values: number[]
) {
  return Math.max(
    1,
    ...values
  );
}

export function KpiCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?:
    | 'default'
    | 'danger'
    | 'warning'
    | 'success'
    | 'violet';
}) {
  return (
    <div
      className={`anKpi anKpi-${tone}`}
    >
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

export function LineChart({
  data,
}: {
  data: DailyPoint[];
}) {
  if (!data.length) {
    return (
      <div className="anEmpty">
        Sin datos para este periodo.
      </div>
    );
  }

  const width = 760;
  const height = 230;
  const padX = 36;
  const padY = 24;

  const max = maxValue(
    data.flatMap((item) => [
      item.cases,
      item.highCritical,
      item.distressHigh,
      item.selfHarm,
    ])
  );

  function points(
    key:
      | 'cases'
      | 'highCritical'
      | 'distressHigh'
      | 'selfHarm'
  ) {
    return data
      .map((item, index) => {
        const x =
          data.length === 1
            ? width / 2
            : padX +
              (index /
                (data.length - 1)) *
                (width -
                  padX * 2);

        const y =
          height -
          padY -
          (item[key] / max) *
            (height -
              padY * 2);

        return `${x},${y}`;
      })
      .join(' ');
  }

  return (
    <div className="anChartWrap">
      <svg
        className="anLineChart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Serie temporal de casos"
      >
        {[0, 1, 2, 3, 4].map(
          (row) => {
            const y =
              padY +
              (row / 4) *
                (height -
                  padY * 2);

            return (
              <line
                key={row}
                x1={padX}
                x2={
                  width -
                  padX
                }
                y1={y}
                y2={y}
                className="anGridLine"
              />
            );
          }
        )}

        <polyline
          points={points('cases')}
          className="anSeries anSeriesCases"
        />
        <polyline
          points={points(
            'highCritical'
          )}
          className="anSeries anSeriesViolence"
        />
        <polyline
          points={points(
            'distressHigh'
          )}
          className="anSeries anSeriesDistress"
        />
        <polyline
          points={points(
            'selfHarm'
          )}
          className="anSeries anSeriesSelf"
        />
      </svg>

      <div className="anLegend">
        <span>
          <i className="anDot cases" />
          Casos
        </span>
        <span>
          <i className="anDot violence" />
          Violencia alta/crítica
        </span>
        <span>
          <i className="anDot distress" />
          Angustia alta/severa
        </span>
        <span>
          <i className="anDot selfharm" />
          Señales de autolesión
        </span>
      </div>

      <div className="anDateAxis">
        {data
          .filter(
            (_, index) =>
              data.length <= 8 ||
              index %
                Math.ceil(
                  data.length / 7
                ) ===
                0 ||
              index ===
                data.length - 1
          )
          .map((item) => (
            <span key={item.date}>
              {item.date.slice(5)}
            </span>
          ))}
      </div>
    </div>
  );
}

export function HorizontalBars({
  data,
  limit = 8,
  emptyLabel = 'Sin datos',
}: {
  data: NamedCount[];
  limit?: number;
  emptyLabel?: string;
}) {
  const rows = data
    .filter(
      (item) =>
        item.value > 0
    )
    .slice(0, limit);

  if (!rows.length) {
    return (
      <div className="anEmpty">
        {emptyLabel}
      </div>
    );
  }

  const max = maxValue(
    rows.map(
      (item) => item.value
    )
  );

  return (
    <div className="anBars">
      {rows.map((item) => (
        <div
          className="anBarRow"
          key={item.label}
        >
          <div className="anBarHead">
            <span>{item.label}</span>
            <strong>
              {item.value}
            </strong>
          </div>
          <div className="anBarTrack">
            <span
              style={{
                width: `${Math.max(
                  3,
                  (item.value /
                    max) *
                    100
                )}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  data,
  centerLabel,
}: {
  data: NamedCount[];
  centerLabel: string;
}) {
  const rows = data
    .filter(
      (item) =>
        item.value > 0
    )
    .slice(0, 6);

  const total = rows.reduce(
    (sum, item) =>
      sum + item.value,
    0
  );

  if (!total) {
    return (
      <div className="anEmpty">
        Sin datos para este periodo.
      </div>
    );
  }

  let angle = 0;
  const stops: string[] = [];
  const classes = [
    'var(--an1)',
    'var(--an2)',
    'var(--an3)',
    'var(--an4)',
    'var(--an5)',
    'var(--an6)',
  ];

  rows.forEach(
    (item, index) => {
      const start = angle;
      const size =
        (item.value / total) *
        360;
      angle += size;

      stops.push(
        `${classes[index]} ${start}deg ${angle}deg`
      );
    }
  );

  return (
    <div className="anDonutLayout">
      <div
        className="anDonut"
        style={{
          background: `conic-gradient(${stops.join(
            ','
          )})`,
        }}
      >
        <div className="anDonutCenter">
          <strong>{total}</strong>
          <small>
            {centerLabel}
          </small>
        </div>
      </div>

      <div className="anDonutLegend">
        {rows.map(
          (item, index) => (
            <div key={item.label}>
              <i
                style={{
                  background:
                    classes[index],
                }}
              />
              <span>
                {item.label}
              </span>
              <strong>
                {item.value}
              </strong>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export function FunnelChart({
  items,
}: {
  items: NamedCount[];
}) {
  const max = maxValue(
    items.map(
      (item) => item.value
    )
  );

  return (
    <div className="anFunnel">
      {items.map(
        (item, index) => (
          <div
            className="anFunnelRow"
            key={item.label}
          >
            <span>
              {item.label}
            </span>
            <div>
              <i
                style={{
                  width: `${Math.max(
                    5,
                    (item.value /
                      max) *
                      100
                  )}%`,
                }}
              />
            </div>
            <strong>
              {item.value}
            </strong>
          </div>
        )
      )}
    </div>
  );
}

export function HourBars({
  values,
}: {
  values: number[];
}) {
  const max = maxValue(values);

  return (
    <div className="anHourBars">
      {values.map(
        (value, hour) => (
          <div
            key={hour}
            title={`${String(
              hour
            ).padStart(
              2,
              '0'
            )}:00 · ${value} casos`}
          >
            <span
              style={{
                height: `${Math.max(
                  3,
                  (value / max) *
                    100
                )}%`,
              }}
            />
            {hour % 3 === 0 && (
              <small>
                {String(
                  hour
                ).padStart(
                  2,
                  '0'
                )}
              </small>
            )}
          </div>
        )
      )}
    </div>
  );
}

export function GeoHeatGrid({
  cells,
  suppressedCases,
  threshold,
  approximateKm,
}: {
  cells: GeoCell[];
  suppressedCases: number;
  threshold: number;
  approximateKm: number;
}) {
  if (!cells.length) {
    return (
      <div className="anGeoEmpty">
        <strong>
          Sin celdas publicables
        </strong>
        <p>
          El mapa solo muestra
          celdas agregadas con al
          menos {threshold} casos.
          Esto evita mostrar
          ubicaciones individuales.
        </p>
        {suppressedCases > 0 && (
          <span>
            {suppressedCases} registros
            geográficos quedaron
            suprimidos por privacidad.
          </span>
        )}
      </div>
    );
  }

  const minLat = Math.min(
    ...cells.map(
      (cell) => cell.lat
    )
  );
  const maxLat = Math.max(
    ...cells.map(
      (cell) => cell.lat
    )
  );
  const minLon = Math.min(
    ...cells.map(
      (cell) => cell.lon
    )
  );
  const maxLon = Math.max(
    ...cells.map(
      (cell) => cell.lon
    )
  );

  const latSpan =
    maxLat - minLat || 0.01;
  const lonSpan =
    maxLon - minLon || 0.01;

  const maxCount = maxValue(
    cells.map(
      (cell) => cell.count
    )
  );

  return (
    <div>
      <div className="anGeoMap">
        <div className="anNorth">
          N
        </div>

        {cells.map((cell) => {
          const x =
            ((cell.lon -
              minLon) /
              lonSpan) *
            88 +
            6;

          const y =
            94 -
            ((cell.lat -
              minLat) /
              latSpan) *
              88;

          const intensity =
            0.2 +
            0.8 *
              (cell.count /
                maxCount);

          return (
            <div
              key={cell.key}
              className="anGeoCell"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                opacity:
                  intensity,
              }}
              title={`Celda agregada · ${cell.count} casos`}
            >
              <strong>
                {cell.count}
              </strong>
            </div>
          );
        })}

        <div className="anGeoAxis west">
          O
        </div>
        <div className="anGeoAxis east">
          E
        </div>
        <div className="anGeoAxis south">
          S
        </div>
      </div>

      <div className="anPrivacyNote">
        Heatmap interno por celdas
        de aproximadamente{' '}
        {approximateKm.toFixed(1)}
        km. No muestra puntos,
        direcciones ni trayectorias
        individuales. Umbral mínimo:
        {` ${threshold} casos por celda.`}
      </div>

      {suppressedCases > 0 && (
        <div className="anPrivacyNote">
          {suppressedCases} registros
          geográficos se suprimieron
          por no alcanzar el umbral de
          privacidad.
        </div>
      )}
    </div>
  );
}
