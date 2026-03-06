"use client";

import { useEffect, useRef } from "react";

interface Center {
    id: number;
    lat: number;
    lng: number;
    name: string;
    type: string;
    distanceKm: string;
}

interface LeafletMapProps {
    center: { lat: number; lng: number };
    userLocation: { lat: number; lng: number };
    centers: Center[];
    activeMarker: number | null;
    onMarkerClick: (id: number) => void;
    onDirections: (lat: number, lng: number) => void;
}

export default function LeafletMap({
    center,
    userLocation,
    centers,
    activeMarker,
    onMarkerClick,
    onDirections,
}: LeafletMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const userMarkerRef = useRef<any>(null);
    const initializedRef = useRef(false);

    // Initialize map once
    useEffect(() => {
        if (initializedRef.current || !mapRef.current) return;
        initializedRef.current = true;

        import("leaflet").then((L) => {
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
                iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
                shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
            });

            const map = L.map(mapRef.current!, {
                center: [center.lat, center.lng],
                zoom: 13,
                zoomControl: true,
            });

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(map);

            mapInstanceRef.current = map;
        });

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                initializedRef.current = false;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fly to new center whenever it changes
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        mapInstanceRef.current.flyTo([center.lat, center.lng], 13, { animate: true, duration: 1 });
    }, [center.lat, center.lng]);

    // Update user location marker
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        import("leaflet").then((L) => {
            if (userMarkerRef.current) userMarkerRef.current.remove();
            const userIcon = L.divIcon({
                className: "",
                html: `<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.3);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
            });
            userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
                .addTo(mapInstanceRef.current)
                .bindTooltip("You are here");
        });
    }, [userLocation.lat, userLocation.lng]);

    // Redraw clinic markers
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        import("leaflet").then((L) => {
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];

            centers.forEach((c) => {
                const isActive = activeMarker === c.id;
                const clinicIcon = L.divIcon({
                    className: "",
                    html: `<div style="width:${isActive ? 20 : 14}px;height:${isActive ? 20 : 14}px;background:${isActive ? "#f97316" : "#ef4444"};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;"></div>`,
                    iconSize: [isActive ? 20 : 14, isActive ? 20 : 14],
                    iconAnchor: [isActive ? 10 : 7, isActive ? 10 : 7],
                });

                const popup = L.popup().setContent(`
                    <div style="min-width:180px;font-family:sans-serif;">
                        <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${c.name}</div>
                        <div style="font-size:11px;color:#64748b;margin-bottom:8px;text-transform:capitalize;">${c.type.replace("_", " ")} · ${c.distanceKm} km away</div>
                        <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}','_blank')"
                            style="width:100%;padding:6px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">
                            Get Directions
                        </button>
                    </div>
                `);

                const marker = L.marker([c.lat, c.lng], { icon: clinicIcon })
                    .addTo(mapInstanceRef.current)
                    .bindPopup(popup);

                marker.on("click", () => onMarkerClick(c.id));
                if (isActive) setTimeout(() => marker.openPopup(), 100);
                markersRef.current.push(marker);
            });
        });
    }, [centers, activeMarker, onMarkerClick]);

    return (
        <>
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <div ref={mapRef} style={{ width: "100%", height: "100%", background: "#1e293b" }} />
        </>
    );
}
