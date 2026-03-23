import { useState, useEffect } from 'react';
import Plot from '../lib/Plot';
import { getLatestCurves, getCurvesForDate } from '../lib/api';
import { CURVE_COLORS, CURVE_LABELS, BENCHMARK_MATURITIES, PLOT_LAYOUT_DEFAULTS } from '../lib/constants';
import CurveTypeToggle from '../components/CurveTypeToggle';

export default function TodayCurve() {
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [activeTypes, setActiveTypes] = useState(['nominal']);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const latest = await getLatestCurves();
        setData(latest);

        // Fetch previous day for bp change
        const d = new Date(latest.date);
        d.setDate(d.getDate() - 3); // go back enough to find a business day
        const prevDate = d.toISOString().split('T')[0];
        const prev = await getCurvesForDate(prevDate);
        setPrevData(prev);
      } catch (e) {
        console.error('Failed to load curves:', e);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="loading">Loading curves...</div>;
  if (!data) return <div className="error">Failed to load data</div>;

  const traces = [];
  for (const type of activeTypes) {
    const points = data.curves[type];
    if (!points) continue;

    traces.push({
      x: points.map((p) => p.maturity_years),
      y: points.map((p) => p.spot_rate),
      name: CURVE_LABELS[type],
      type: 'scatter',
      mode: 'lines',
      line: { color: CURVE_COLORS[type], width: 2.5 },
      hovertemplate: '%{y:.3f}%<extra>' + CURVE_LABELS[type] + '</extra>',
    });
  }

  // Build benchmark annotations
  const annotations = [];
  if (data.curves[activeTypes[0]] && prevData?.curves?.[activeTypes[0]]) {
    const todayPoints = data.curves[activeTypes[0]];
    const prevPoints = prevData.curves[activeTypes[0]];
    const prevMap = Object.fromEntries(prevPoints.map((p) => [p.maturity_months, p.spot_rate]));

    for (const mat of BENCHMARK_MATURITIES) {
      const todayPt = todayPoints.find((p) => p.maturity_months === mat);
      const prevRate = prevMap[mat];
      if (todayPt && prevRate != null) {
        const bpChange = ((todayPt.spot_rate - prevRate) * 100).toFixed(1);
        const sign = bpChange > 0 ? '+' : '';
        annotations.push({
          x: todayPt.maturity_years,
          y: todayPt.spot_rate,
          text: `${sign}${bpChange}bp`,
          showarrow: true,
          arrowhead: 0,
          arrowcolor: '#666',
          font: {
            size: 11,
            color: bpChange > 0 ? '#ef5350' : bpChange < 0 ? '#66bb6a' : '#999',
          },
          bgcolor: '#1a1a2e',
          ax: 0,
          ay: -30,
        });
      }
    }
  }

  const layout = {
    ...PLOT_LAYOUT_DEFAULTS,
    title: { text: `UK Yield Curves — ${data.date}`, font: { size: 16, color: '#e0e0e0' } },
    annotations,
  };

  return (
    <div className="view">
      <CurveTypeToggle active={activeTypes} onChange={setActiveTypes} multi />
      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%', height: 'calc(100vh - 160px)' }}
      />
    </div>
  );
}
