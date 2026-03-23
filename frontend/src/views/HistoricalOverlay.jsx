import { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { getLatestCurves, getPresets, compareCurves } from '../lib/api';
import { CURVE_LABELS, OVERLAY_COLORS, PLOT_LAYOUT_DEFAULTS } from '../lib/constants';
import CurveTypeToggle from '../components/CurveTypeToggle';

export default function HistoricalOverlay() {
  const [latestData, setLatestData] = useState(null);
  const [presets, setPresets] = useState([]);
  const [curveType, setCurveType] = useState('nominal');
  const [overlayDates, setOverlayDates] = useState([]);
  const [overlayData, setOverlayData] = useState({});
  const [customDate, setCustomDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [latest, presetsRes] = await Promise.all([getLatestCurves(), getPresets()]);
        setLatestData(latest);
        setPresets(presetsRes.presets);
      } catch (e) {
        console.error('Failed to load:', e);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!overlayDates.length) {
      setOverlayData({});
      return;
    }
    async function loadOverlays() {
      try {
        const res = await compareCurves(overlayDates, curveType);
        setOverlayData(res.curves);
      } catch (e) {
        console.error('Failed to load overlays:', e);
      }
    }
    loadOverlays();
  }, [overlayDates, curveType]);

  const togglePreset = (date) => {
    if (!date) return;
    setOverlayDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : prev.length < 5 ? [...prev, date] : prev
    );
  };

  const addCustomDate = () => {
    if (customDate && !overlayDates.includes(customDate) && overlayDates.length < 5) {
      setOverlayDates((prev) => [...prev, customDate]);
      setCustomDate('');
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!latestData) return <div className="error">Failed to load data</div>;

  const todayPoints = latestData.curves[curveType] || [];
  const todayMap = Object.fromEntries(todayPoints.map((p) => [p.maturity_months, p.spot_rate]));

  const traces = [
    {
      x: todayPoints.map((p) => p.maturity_years),
      y: todayPoints.map((p) => p.spot_rate),
      name: `Today (${latestData.date})`,
      type: 'scatter',
      mode: 'lines',
      line: { color: '#ffffff', width: 3 },
      hovertemplate: '%{y:.3f}%<extra>Today</extra>',
    },
  ];

  let colorIdx = 0;
  for (const [actualDate, info] of Object.entries(overlayData)) {
    const color = OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];
    const label = info.requested_date === actualDate ? actualDate : `${info.requested_date} (${actualDate})`;

    traces.push({
      x: info.points.map((p) => p.maturity_years),
      y: info.points.map((p) => p.spot_rate),
      name: label,
      type: 'scatter',
      mode: 'lines',
      line: { color, width: 2, dash: 'dot' },
      customdata: info.points.map((p) => {
        const todayRate = todayMap[p.maturity_months];
        if (todayRate != null && p.spot_rate != null) {
          return ((todayRate - p.spot_rate) * 100).toFixed(1);
        }
        return 'N/A';
      }),
      hovertemplate: '%{y:.3f}% (diff: %{customdata}bp)<extra>' + label + '</extra>',
    });
  }

  const layout = {
    ...PLOT_LAYOUT_DEFAULTS,
    title: {
      text: `${CURVE_LABELS[curveType]} Curve — Historical Overlay`,
      font: { size: 16, color: '#e0e0e0' },
    },
  };

  return (
    <div className="view">
      <CurveTypeToggle active={curveType} onChange={setCurveType} />

      <div className="controls-row">
        <div className="presets-section">
          <span className="controls-label">Presets:</span>
          <div className="preset-buttons">
            {presets.map((p) => (
              <button
                key={p.label}
                className={`preset-btn ${p.date && overlayDates.includes(p.date) ? 'active' : ''}`}
                onClick={() => togglePreset(p.date)}
                disabled={!p.date}
                title={p.date || 'No data available'}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="custom-date-section">
          <span className="controls-label">Custom date:</span>
          <div className="custom-date-row">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="date-input"
            />
            <button className="add-btn" onClick={addCustomDate} disabled={!customDate}>
              Add
            </button>
          </div>
        </div>
      </div>

      {overlayDates.length > 0 && (
        <div className="active-overlays">
          {overlayDates.map((d) => (
            <span key={d} className="overlay-tag">
              {d}
              <button className="tag-remove" onClick={() => togglePreset(d)}>x</button>
            </span>
          ))}
        </div>
      )}

      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%', height: 'calc(100vh - 250px)' }}
      />
    </div>
  );
}
