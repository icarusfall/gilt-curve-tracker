import { useState, useEffect } from 'react';
import Plot from '../lib/Plot';
import { getCurveRange } from '../lib/api';
import { OVERLAY_COLORS, PLOT_LAYOUT_DEFAULTS } from '../lib/constants';

const SPREAD_PRESETS = [
  { label: '2s10s (Curve Slope)', leg1: { type: 'nominal', mat: 120 }, leg2: { type: 'nominal', mat: 24 } },
  { label: '10s30s', leg1: { type: 'nominal', mat: 360 }, leg2: { type: 'nominal', mat: 120 } },
  { label: '10Y Breakeven Inflation', leg1: { type: 'nominal', mat: 120 }, leg2: { type: 'real', mat: 120 } },
  { label: '5Y Breakeven Inflation', leg1: { type: 'nominal', mat: 60 }, leg2: { type: 'real', mat: 60 } },
  { label: 'Gilt-OIS 10Y', leg1: { type: 'nominal', mat: 120 }, leg2: { type: 'ois', mat: 120 } },
];

const RANGE_OPTIONS = [
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export default function Spreads() {
  const [selectedSpreads, setSelectedSpreads] = useState([0]);
  const [rangeDays, setRangeDays] = useState(365);
  const [spreadData, setSpreadData] = useState({});
  const [loading, setLoading] = useState(false);

  const toggleSpread = (idx) => {
    setSelectedSpreads((prev) =>
      prev.includes(idx) ? (prev.length > 1 ? prev.filter((i) => i !== idx) : prev) : [...prev, idx]
    );
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      const start = daysAgo(rangeDays);
      const end = daysAgo(0);
      const results = {};

      await Promise.all(
        selectedSpreads.map(async (idx) => {
          const spread = SPREAD_PRESETS[idx];
          try {
            const [res1, res2] = await Promise.all([
              getCurveRange(start, end, spread.leg1.type, spread.leg1.mat),
              getCurveRange(start, end, spread.leg2.type, spread.leg2.mat),
            ]);

            const map2 = Object.fromEntries(res2.data.map((d) => [d.date, d.spot_rate]));
            results[idx] = res1.data
              .filter((d) => map2[d.date] != null && d.spot_rate != null)
              .map((d) => ({
                date: d.date,
                spread: ((d.spot_rate - map2[d.date]) * 100).toFixed(1),
              }));
          } catch (e) {
            console.error(`Failed to load spread ${idx}:`, e);
          }
        })
      );

      setSpreadData(results);
      setLoading(false);
    }
    load();
  }, [selectedSpreads, rangeDays]);

  const traces = selectedSpreads.map((idx, i) => {
    const data = spreadData[idx] || [];
    return {
      x: data.map((d) => d.date),
      y: data.map((d) => parseFloat(d.spread)),
      name: SPREAD_PRESETS[idx].label,
      type: 'scatter',
      mode: 'lines',
      line: { color: OVERLAY_COLORS[i % OVERLAY_COLORS.length], width: 2 },
      hovertemplate: '%{x}<br>%{y:.1f}bp<extra>' + SPREAD_PRESETS[idx].label + '</extra>',
    };
  });

  const layout = {
    ...PLOT_LAYOUT_DEFAULTS,
    title: { text: 'Yield Spreads', font: { size: 16, color: '#e0e0e0' } },
    xaxis: { ...PLOT_LAYOUT_DEFAULTS.xaxis, title: { text: 'Date' }, type: 'date' },
    yaxis: { ...PLOT_LAYOUT_DEFAULTS.yaxis, title: { text: 'Spread (bp)' }, ticksuffix: 'bp' },
  };

  return (
    <div className="view">
      <div className="controls-row">
        <div>
          <span className="controls-label">Spreads:</span>
          <div className="toggle-group">
            {SPREAD_PRESETS.map((s, i) => (
              <button
                key={i}
                className={`toggle-btn ${selectedSpreads.includes(i) ? 'active' : ''}`}
                onClick={() => toggleSpread(i)}
              >
                {s.label}
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
        style={{ width: '100%', height: 'calc(100vh - 200px)' }}
      />
    </div>
  );
}
