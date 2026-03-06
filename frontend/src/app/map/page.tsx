"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, MapPin, Loader2, Navigation, Search, AlertCircle } from "lucide-react";

interface Center {
    id: number;
    lat: number;
    lng: number;
    name: string;
    type: string;
    distanceKm: string;
}

const MUMBAI_FALLBACK = { lat: 19.0760, lng: 72.8777 };

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Dynamically import the map so it only renders client-side (Leaflet requires window)
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
    ssr: false, loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    )
});

export default function MapPage() {
    const router = useRouter();

    const [userLocation, setUserLocation] = useState(MUMBAI_FALLBACK);
    const [mapCenter, setMapCenter] = useState(MUMBAI_FALLBACK);
    const [centers, setCenters] = useState<Center[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMarker, setActiveMarker] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [locationLabel, setLocationLabel] = useState("Detecting location...");

    const fetchCenters = useCallback(async (lat: number, lng: number) => {
        try {
            setLoading(true);
            // 10km radius for better coverage across all Indian cities
            const overpassQuery = `
[out:json][timeout:30];
(
  node["amenity"="clinic"](around:10000,${lat},${lng});
  node["amenity"="hospital"](around:10000,${lat},${lng});
  node["amenity"="health_post"](around:10000,${lat},${lng});
  node["healthcare"="vaccination_centre"](around:10000,${lat},${lng});
  node["healthcare"="clinic"](around:10000,${lat},${lng});
  node["healthcare"="hospital"](around:10000,${lat},${lng});
);
out body;
`;
            const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
            const res = await fetch(url);
            const data = await res.json();

            const parsed: Center[] = (data.elements || [])
                .filter((el: any) => el.tags && (el.tags.name || el.tags.amenity || el.tags.healthcare))
                .map((el: any) => {
                    const dist = getDistanceFromLatLonInKm(lat, lng, el.lat, el.lon);
                    return {
                        id: el.id,
                        lat: el.lat,
                        lng: el.lon,
                        name: el.tags.name || el.tags.amenity || el.tags.healthcare || "Medical Center",
                        type: el.tags.amenity || el.tags.healthcare || "clinic",
                        distanceKm: dist.toFixed(1),
                    };
                })
                .sort((a: Center, b: Center) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm));

            setCenters(parsed);
        } catch (err) {
            console.error("Failed to fetch overpass data", err);
            setCenters([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Reverse geocode to get a readable city name
    const reverseGeocode = useCallback(async (lat: number, lng: number) => {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                { headers: { "Accept-Language": "en" } }
            );
            const data = await res.json();
            const city = data.address?.city || data.address?.town || data.address?.state_district || data.address?.state || "Your Location";
            setLocationLabel(city);
        } catch {
            setLocationLabel("Your Location");
        }
    }, []);

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    setUserLocation({ lat, lng });
                    setMapCenter({ lat, lng });
                    fetchCenters(lat, lng);
                    reverseGeocode(lat, lng);
                },
                () => {
                    setLocationLabel("Mumbai (fallback)");
                    fetchCenters(MUMBAI_FALLBACK.lat, MUMBAI_FALLBACK.lng);
                },
                { timeout: 8000 }
            );
        } else {
            setLocationLabel("Mumbai (fallback)");
            fetchCenters(MUMBAI_FALLBACK.lat, MUMBAI_FALLBACK.lng);
        }
    }, [fetchCenters, reverseGeocode]);

    // City search — uses Nominatim to geocode, then re-fetches clinics
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery + ", India")}&format=json&limit=1`,
                { headers: { "Accept-Language": "en" } }
            );
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                setMapCenter({ lat, lng });
                setUserLocation({ lat, lng });
                setLocationLabel(data[0].display_name.split(",")[0]);
                fetchCenters(lat, lng);
                setActiveMarker(null);
            }
        } catch (err) {
            console.error("Geocoding failed", err);
        } finally {
            setSearchLoading(false);
        }
    };

    const handleDirections = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
    };

    return (
        <div className="h-screen flex flex-col bg-[#0f172a] text-white overflow-hidden">
            {/* Navbar */}
            <nav className="border-b border-white/10 px-8 py-4 flex items-center justify-between bg-[#0f172a] z-50">
                <button
                    onClick={() => router.push("/dashboard")}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    Back
                </button>
                <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-500" />
                    <span className="font-bold uppercase tracking-widest text-[10px]">Vaccination Centers</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    {locationLabel}
                </div>
            </nav>

            <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">

                {/* Sidebar */}
                <aside className="w-full md:w-96 bg-slate-900 border-r border-white/10 flex flex-col h-full z-10">
                    <div className="p-6 border-b border-white/10">
                        <h2 className="text-xl font-bold mb-1">Nearby Clinics</h2>
                        <p className="text-sm text-slate-400 mb-4">Vaccination centers within 10km. Works across all Indian cities.</p>

                        {/* City search */}
                        <form onSubmit={handleSearch} className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search any city (e.g. Delhi, Chennai)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-14 text-sm focus:border-blue-500 focus:outline-none transition-all"
                            />
                            <button
                                type="submit"
                                disabled={searchLoading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                            >
                                {searchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Go"}
                            </button>
                        </form>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center text-slate-400 py-12 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                <p className="text-sm">Scanning OpenStreetMap...</p>
                            </div>
                        ) : centers.length === 0 ? (
                            <div className="text-center p-6 bg-white/5 rounded-2xl border border-white/10">
                                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                                <p className="text-sm text-slate-300">No vaccination centers found within 10km.</p>
                                <p className="text-xs text-slate-500 mt-2">Try searching a nearby city.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-slate-500 px-1">{centers.length} centers found</p>
                                {centers.map((center) => (
                                    <div
                                        key={center.id}
                                        onClick={() => {
                                            setActiveMarker(center.id);
                                            setMapCenter({ lat: center.lat, lng: center.lng });
                                        }}
                                        className={`p-4 rounded-2xl border cursor-pointer hover:bg-white/5 transition-all
                                            ${activeMarker === center.id ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-white/5"}`}
                                    >
                                        <div className="flex justify-between items-start gap-2 mb-2">
                                            <h3 className="font-bold text-sm leading-tight text-white">{center.name}</h3>
                                            <span className="text-xs font-mono font-medium text-blue-400 whitespace-nowrap bg-blue-500/10 px-2 py-0.5 rounded-md">
                                                {center.distanceKm} km
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-3 capitalize">{center.type.replace("_", " ")}</p>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDirections(center.lat, center.lng); }}
                                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/20 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Navigation className="w-3.5 h-3.5" />
                                            Get Directions
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </aside>

                {/* Map Area */}
                <main className="flex-1 bg-slate-950 relative h-full min-h-[50vh]">
                    <LeafletMap
                        center={mapCenter}
                        userLocation={userLocation}
                        centers={centers}
                        activeMarker={activeMarker}
                        onMarkerClick={setActiveMarker}
                        onDirections={handleDirections}
                    />
                </main>
            </div>
        </div>
    );
}
