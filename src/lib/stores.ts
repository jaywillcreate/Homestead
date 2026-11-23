import { geocodeZip, type ZipLocation } from "./discovery";

/**
 * Building-supply stores near a ZIP code.
 *  - With GOOGLE_PLACES_API_KEY: Places API (New) text search around the ZIP.
 *  - Otherwise: OpenStreetMap via the public Overpass API — free and keyless.
 * Results are cached per ZIP for a few hours; stores don't move often.
 */

export interface NearbyStore {
  name: string;
  /** Chain name when known, e.g. "The Home Depot". */
  brand: string | null;
  kind: string;
  address: string | null;
  distance_mi: number;
  phone: string | null;
  website: string | null;
  hours: string | null;
  maps_url: string;
  /** Home Depot store number when the source knows it — enables in-store stock lookups. */
  home_depot_store_id: string | null;
}

export interface StoresResult {
  location: ZipLocation | null;
  stores: NearbyStore[];
  source: "google_places" | "openstreetmap" | "none";
  error: string | null;
}

const RADIUS_M = 24_000; // ~15 miles
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; result: StoresResult }>();

const KIND_LABEL: Record<string, string> = {
  doityourself: "Home improvement", hardware: "Hardware", trade: "Building supply", paint: "Paint",
  garden_centre: "Garden center", flooring: "Flooring", tiles: "Tile", lumber: "Lumber",
  building_materials: "Building supply",
};

function miles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const mapsUrl = (name: string, address: string | null, lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ? `${name}, ${address}` : `${lat},${lng}`)}`;

export async function nearbyStores(zip: string): Promise<StoresResult> {
  const hit = cache.get(zip);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const location = await geocodeZip(zip);
  if (!location) {
    return { location: null, stores: [], source: "none", error: `Couldn't place ZIP code ${zip} — check it, or try again in a moment.` };
  }
  let result: StoresResult;
  try {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    result = key
      ? { location, stores: await fromGooglePlaces(location, key), source: "google_places", error: null }
      : { location, stores: await fromOpenStreetMap(location), source: "openstreetmap", error: null };
    if (result.stores.length) cache.set(zip, { at: Date.now(), result });
  } catch (err) {
    result = {
      location, stores: [], source: "none",
      error: `Store lookup is unavailable right now (${err instanceof Error ? err.message : "network error"}).`,
    };
  }
  return result;
}

async function fromOpenStreetMap(loc: ZipLocation): Promise<NearbyStore[]> {
  const kinds = Object.keys(KIND_LABEL).join("|");
  const query = `[out:json][timeout:20];
(nwr["shop"~"^(${kinds})$"]["name"](around:${RADIUS_M},${loc.lat},${loc.lng}););
out center tags 120;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Homestead household maintenance app (store lookup)",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`OpenStreetMap ${res.status}`);
  const data = (await res.json()) as {
    elements?: {
      lat?: number; lon?: number; center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }[];
  };
  const stores: NearbyStore[] = [];
  for (const el of data.elements ?? []) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!t.name || lat == null || lng == null) continue;
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const address = [street, t["addr:city"], t["addr:state"]].filter(Boolean).join(", ") || null;
    const brand = t.brand ?? null;
    const isHomeDepot = /home depot/i.test(`${brand ?? ""} ${t.name}`);
    stores.push({
      name: t.name,
      brand,
      kind: KIND_LABEL[t.shop] ?? "Store",
      address,
      distance_mi: Math.round(miles(loc.lat, loc.lng, lat, lng) * 10) / 10,
      phone: t.phone ?? t["contact:phone"] ?? null,
      website: t.website ?? t["contact:website"] ?? null,
      hours: t.opening_hours ?? null,
      maps_url: mapsUrl(t.name, address, lat, lng),
      home_depot_store_id: isHomeDepot && /^\d{3,5}$/.test(t.ref ?? "") ? t.ref : null,
    });
  }
  return dedupe(stores).slice(0, 18);
}

async function fromGooglePlaces(loc: ZipLocation, key: string): Promise<NearbyStore[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: `home improvement, hardware and building supply stores near ${loc.city}, ${loc.state} ${loc.zip}`,
      maxResultCount: 18,
      locationBias: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: RADIUS_M } },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const data = (await res.json()) as {
    places?: {
      displayName?: { text?: string }; formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      nationalPhoneNumber?: string; websiteUri?: string;
      primaryTypeDisplayName?: { text?: string }; googleMapsUri?: string;
    }[];
  };
  const stores: NearbyStore[] = [];
  for (const p of data.places ?? []) {
    const name = p.displayName?.text;
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (!name || lat == null || lng == null) continue;
    stores.push({
      name,
      brand: null,
      kind: p.primaryTypeDisplayName?.text ?? "Store",
      address: p.formattedAddress ?? null,
      distance_mi: Math.round(miles(loc.lat, loc.lng, lat, lng) * 10) / 10,
      phone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      hours: null,
      maps_url: p.googleMapsUri ?? mapsUrl(name, p.formattedAddress ?? null, lat, lng),
      home_depot_store_id: null,
    });
  }
  return dedupe(stores);
}

/** Closest first; one entry per name+address. */
function dedupe(stores: NearbyStore[]): NearbyStore[] {
  const seen = new Set<string>();
  return stores
    .sort((a, b) => a.distance_mi - b.distance_mi)
    .filter((s) => {
      const k = `${s.name.toLowerCase()}|${(s.address ?? String(s.distance_mi)).toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
