import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatoCOP, formatoKwh } from '@/lib/api';

interface Punto {
  fecha: string; // YYYY-MM-DD
  kwh: number;
  ingresos: number;
  sesiones: number;
}

const diaCorto = (fecha: string) =>
  new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

const diaLargo = (fecha: string) =>
  new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

const ejeComun = {
  stroke: 'var(--tenue)',
  tick: { fill: 'var(--tenue)', fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

function Globo({ active, payload, formato }: { active?: boolean; payload?: { payload: Punto }[]; formato: (p: Punto) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="grafico-tooltip">
      <div className="fecha">{diaLargo(p.fecha)}</div>
      <div className="valor">{formato(p)}</div>
      <div className="fecha">
        {p.sesiones} {p.sesiones === 1 ? 'sesión' : 'sesiones'}
      </div>
    </div>
  );
}

// Una sola serie por gráfico (energía o ingresos): el título la nombra, no hace falta leyenda.
export function GraficoEnergia({ datos }: { datos: Punto[] }) {
  return (
    <div className="grafico" role="img" aria-label="Energía entregada por día, en kWh">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--linea-suave)" />
          <XAxis dataKey="fecha" tickFormatter={diaCorto} {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...ejeComun} width={48} tickFormatter={(v: number) => `${v}`} allowDecimals />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={<Globo formato={(p) => formatoKwh(p.kwh)} />}
          />
          <Bar dataKey="kwh" fill="var(--serie-energia)" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoIngresos({ datos }: { datos: Punto[] }) {
  return (
    <div className="grafico" role="img" aria-label="Ingresos por día, en pesos colombianos">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--linea-suave)" />
          <XAxis dataKey="fecha" tickFormatter={diaCorto} {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
          <YAxis
            {...ejeComun}
            width={64}
            tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)} mil` : `$${v}`)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--tenue)', strokeDasharray: '3 3' }}
            content={<Globo formato={(p) => formatoCOP(p.ingresos)} />}
          />
          <Line
            type="monotone"
            dataKey="ingresos"
            stroke="var(--serie-ingresos)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 5, stroke: 'var(--panel)', strokeWidth: 2, fill: 'var(--serie-ingresos)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
