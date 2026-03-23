import { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { getCurveRange } from '../lib/api';
import { CURVE_LABELS, OVERLAY_COLORS, PLOT_LAYOUT_DEFAULTS } from '../lib/constants';
import CurveTypeToggle from '../components/CurveTypeToggle';

const MATURITY_OPTIONS = [
  { label: '2Y', months: 24 },
  { label: '5Y', months: 60 },
  { label: '10Y', months: 120 },
  { label: '20Y', months: 240 },
  { label: '30Y', months: 360 },
];

const RANGE_OPTIONS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export default function TimeSeries() {
  const [curveType, setCurveType] = useState('nominal');
  const [selectedMaturities, setSelectedMaturities] = useState([120]);
  const [rangeDays, setRangeDays] = useState(365);
  const [seriesData, setSeriesData] = useState({});
  const [loading, setLoading] = useState(false);

  const toggleMaturity = (months) => {
    setSelectedMaturities((prev) =>
      prev.includes(months) ? (prev.length > 1 ? prev.filter((m) => m !== months) : prev) : [...prev, months]
    );
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      const start = daysAgo(rangeDays);
      const end = daysAgo(0);
      const results = {};
      await Promise.all(
        selectedMaturities.map(async (mat) => {
          try {
            const res = await getCurveRange(start, end, curveType, mat);
            results[mat] = res.data;
          } catch (e) {
            console.error(`Failed to load ${mat}m:`, e);
          }
        })
      );
      setSeriesData(results);
      setLoading(false);
    }
    load();
  }, [curveType, selectedMaturities, rangeDays]);

  const traces = selectedMaturities.map((mat, i) => {
    const data = seriesData[mat] || [];
    const label = MATURITY_OPTIONS.find((m) => m.months === mat)?.label || `${mat}m`;
    return {
      x: data.map((d) => d.date),
      y: data.map((d) => d.spot_rate),
      name: `${label} ${CURVE_LABELS[curveType]}`,
      type: 'scatter',
      mode: 'lines',
      line: { color: OVERLAY_COLORS[i % OVERLAY_COLORS.length], width: 2 },
      hovertemplate: '%{x}<br>%{y:.3f}%<extra>' + label + '</extra>',
    };
  });

  const layout = {
    ...PLOT_LAYOUT_DEFAULTS,
    title: { text: `${CURVE_LABELS[curveType]} — Time Series`, font: { size: 16, color: '#e0e0e0' } },
    xaxis: { ...PLOT_LAYOUT_DEFAULTS.xaxis, title: { text: 'Date' }, type: 'date' },
  };

  return (
    <div className="view">
      <CurveTypeToggle active={curveType} onChange={setCurveType} />

      <div className="controls-row">
        <div>
          <span className="controls-label">Maturity:</span>
          <div className="toggle-group">
            {MATURITY_OPTIONS.map(({ label, months }) => (
              <button
                key={months}
                className={`toggle-btn ${selectedMaturities.includes(months) ? 'active' : ''}`}
                onClick={() => toggleMaturity(months)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="controls-label">Range:</span>
          <div className="toggle-group">
            {RANGE_OPTIONS.map(({ label, days }) => (
              <button
                key={days}
                className={`toggle-btn ${rangeDays === days ? 'active' : ''}`}
                onClick={() => setRangeDays(days)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="loading-inline">Loading...</div>}

      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%', height: 'calc(100vh - 210px)' }}
      />
    </div>
  );
}
