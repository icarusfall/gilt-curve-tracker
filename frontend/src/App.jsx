import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import TodayCurve from './views/TodayCurve';
import HistoricalOverlay from './views/HistoricalOverlay';
import TimeSeries from './views/TimeSeries';
import Spreads from './views/Spreads';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Nav />
        <main className="main">
          <Routes>
            <Route path="/" element={<TodayCurve />} />
            <Route path="/overlay" element={<HistoricalOverlay />} />
            <Route path="/timeseries" element={<TimeSeries />} />
            <Route path="/spreads" element={<Spreads />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
