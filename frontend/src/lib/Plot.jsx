import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

export default function Plot({ data, layout, config, style }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;

    Plotly.react(ref.current, data, layout, config);

    return () => {
      if (ref.current) Plotly.purge(ref.current);
    };
  }, [data, layout, config]);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(() => {
      Plotly.Plots.resize(ref.current);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} style={style} />;
}
