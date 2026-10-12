import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Public OSM tiles require no private key. Local markers stay usable if tiles fail.
export default function LocalMap({ location, recommendations = [], records = [], boundary, onSelect, locale }) {
  const element = useRef(null), map = useRef(null), layer = useRef(null), callback = useRef(onSelect);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  callback.current = onSelect;
  useEffect(() => {
    const instance = L.map(element.current).setView([location.lat, location.lng], 12);
    map.current = instance;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(instance);
    tiles.on('tileerror', () => setTilesUnavailable(true));
    tiles.on('tileload', () => setTilesUnavailable(false));
    instance.on('click', event => callback.current({lat: event.latlng.lat, lng: event.latlng.lng}));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
    // The instance is intentionally created once; data is synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!map.current) return;
    map.current.panTo([location.lat, location.lng]);
    if (layer.current) layer.current.remove();
    layer.current = L.layerGroup().addTo(map.current);
    if (boundary) L.geoJSON(boundary, {style: {color:'#0ea5a8',weight:1,fillOpacity:.03}}).addTo(layer.current);
    L.circleMarker([location.lat, location.lng], {radius:10,color:'#00a8b8',fillOpacity:1}).addTo(layer.current);
    records.forEach(p => {
      const label = document.createElement('span'); label.textContent = `${p.name} · ${p.data_kind}`;
      L.circleMarker([p.latitude,p.longitude], {radius:5,color:p.is_competitor?'#ef4444':'#16a34a',fillOpacity:.7}).bindTooltip(label).addTo(layer.current);
    });
    recommendations.forEach((p,i) => {
      const marker = L.marker([p.latitude,p.longitude],{icon:L.divIcon({className:'rt-duqm-pin',html:String(i+1),iconSize:[28,28]})});
      const label=document.createElement('span');label.textContent=`${p.area_name} · ${p.score}/100 ESTIMATED`;
      marker.bindTooltip(label).on('click',()=>callback.current({lat:p.latitude,lng:p.longitude},locale==='ar'?p.area_name_ar:p.area_name)).addTo(layer.current);
    });
  }, [location, records, recommendations, boundary, locale]);
  return <>
    {tilesUnavailable && <p role="status">{locale==='ar'?'خلفية الخريطة غير متاحة. النقاط المحلية تظل قابلة للاستخدام؛ الشبكة ليست خريطة طرق.':'Map tiles unavailable. Local points remain interactive; the grid is not a road map.'}</p>}
    <div ref={element} className="rt-local-map" aria-label={locale==='ar'?'خريطة الموقع البديلة':'Fallback location map'} />
  </>;
}
