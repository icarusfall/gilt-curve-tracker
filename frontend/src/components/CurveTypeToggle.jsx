import { CURVE_TYPES, CURVE_LABELS, CURVE_COLORS } from '../lib/constants';

export default function CurveTypeToggle({ active, onChange, multi = false }) {
  const toggle = (type) => {
    if (multi) {
      const next = active.includes(type)
        ? active.filter((t) => t !== type)
        : [...active, type];
      onChange(next.length ? next : [type]); // keep at least one
    } else {
      onChange(type);
    }
  };

  return (
    <div className="toggle-group">
      {CURVE_TYPES.map((type) => {
        const isActive = multi ? active.includes(type) : active === type;
        return (
          <button
            key={type}
            className={`toggle-btn ${isActive ? 'active' : ''}`}
            style={isActive ? { borderColor: CURVE_COLORS[type], color: CURVE_COLORS[type] } : {}}
            onClick={() => toggle(type)}
          >
            {CURVE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
