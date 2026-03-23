import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Today' },
  { to: '/overlay', label: 'Historical Overlay' },
  { to: '/timeseries', label: 'Time Series' },
  { to: '/spreads', label: 'Spreads' },
];

export default function Nav() {
  return (
    <nav className="nav">
      <div className="nav-brand">UK Gilt Curves</div>
      <div className="nav-links">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
