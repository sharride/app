import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const customMarkerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  startPoint?: { lat: number; lng: number; label?: string };
  endPoint?: { lat: number; lng: number; label?: string };
  polylinePositions?: [number, number][];
  height?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  center,
  zoom = 13,
  startPoint,
  endPoint,
  polylinePositions = [],
  height = '220px'
}) => {
  return (
    <div style={{ height }} className="w-full rounded-2xl overflow-hidden shadow-inner border border-primary-200 relative z-0">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {startPoint && (
          <Marker position={[startPoint.lat, startPoint.lng]} icon={customMarkerIcon}>
            <Popup>{startPoint.label || 'نقطة الانطلاق'}</Popup>
          </Marker>
        )}
        {endPoint && (
          <Marker position={[endPoint.lat, endPoint.lng]} icon={customMarkerIcon}>
            <Popup>{endPoint.label || 'وجهة الوصول'}</Popup>
          </Marker>
        )}
        {polylinePositions.length > 0 && (
          <Polyline positions={polylinePositions} color="#f59e0b" weight={4} opacity={0.9} />
        )}
      </MapContainer>
    </div>
  );
};