export const CURVE_TYPES = ['nominal', 'real', 'inflation', 'ois'];

export const CURVE_COLORS = {
  nominal: '#4fc3f7',
  real: '#81c784',
  inflation: '#ffb74d',
  ois: '#ce93d8',
};

export const CURVE_LABELS = {
  nominal: 'Nominal',
  real: 'Real (Index-Linked)',
  inflation: 'Implied Inflation',
  ois: 'OIS (SONIA)',
};

export const OVERLAY_COLORS = [
  '#4fc3f7', '#ff8a65', '#81c784', '#ce93d8', '#fff176',
  '#f48fb1', '#80cbc4', '#ef5350', '#7986cb', '#a1887f',
];

export const BENCHMARK_MATURITIES = [24, 60, 120, 360]; // 2Y, 5Y, 10Y, 30Y

export const PLOT_LAYOUT_DEFAULTS = {
  paper_bgcolor: '#1a1a2e',
  plot_bgcolor: '#1a1a2e',
  font: { color: '#e0e0e0', family: 'Inter, system-ui, sans-serif' },
  xaxis: {
    gridcolor: '#2a2a4a',
    zerolinecolor: '#2a2a4a',
    title: { text: 'Maturity (years)' },
  },
  yaxis: {
    gridcolor: '#2a2a4a',
    zerolinecolor: '#2a2a4a',
    title: { text: 'Yield (%)' },
    ticksuffix: '%',
  },
  legend: {
    bgcolor: 'rgba(0,0,0,0)',
    font: { size: 12 },
  },
  margin: { l: 60, r: 30, t: 40, b: 50 },
  hovermode: 'x unified',
};
