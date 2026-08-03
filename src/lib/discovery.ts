/**
 * Local pro discovery — pluggable provider with ZIP-code geolocation.
 *
 * ZIP geolocation uses Zippopotam.us (free, keyless) to resolve a US ZIP to
 * coordinates + city/state. With GOOGLE_PLACES_API_KEY set, results come from
 * the Places API (New) Text Search biased to a 25-mile circle around the ZIP,
 * with real straight-line distances. Without it, deterministic sample data is
 * returned, labeled with the resolved location so the flow stays demonstrable.
 */

export interface LocalPro {
  name: string;
  rating: number | null;
  review_count: number | null;
  review_excerpt: string | null;
  distance_note: string | null;
  address: string | null;
  source: "google_places" | "sample";
}

export interface ZipLocation {
  zip: string;
  city: string;
  state: string; // abbreviation
  lat: number;
  lng: number;
}

export interface DiscoveryResult {
  pros: LocalPro[];
  source: string;
  location: ZipLocation | null;
}

// ZIP centers change essentially never — cache for the process lifetime.
const zipCache = new Map<string, ZipLocation | null>();

export async function geocodeZip(zip: string): Promise<ZipLocation | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  if (zipCache.has(zip)) return zipCache.get(zip)!;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      zipCache.set(zip, null);
      return null;
    }
    const data = (await res.json()) as {
      places?: { "place name": string; "state abbreviation": string; latitude: string; longitude: string }[];
    };
    const place = data.places?.[0];
    if (!place) {
      zipCache.set(zip, null);
      return null;
    }
    const loc: ZipLocation = {
      zip,
      city: place["place name"],
      state: place["state abbreviation"],
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
    };
    zipCache.set(zip, loc);
    return loc;
  } catch {
    return null; // geocoder unreachable — caller falls back to address text
  }
}

function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function discoverLocalPros(
  query: string,
  near: string,
  zip?: string
): Promise<DiscoveryResult> {
  const location = zip ? await geocodeZip(zip) : null;
  const nearText = location ? `${location.city}, ${location.state} ${location.zip}` : near;
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key) {
    try {
      const pros = await googlePlaces(query, nearText, key, location);
      if (pros.length) return { pros, source: "google_places", location };
    } catch {
      // fall through to sample data — never break the screen on a provider error
    }
  }
  return { pros: samplePros(query, location), source: "sample", location };
}

async function googlePlaces(
  query: string,
  nearText: string,
  key: string,
  location: ZipLocation | null
): Promise<LocalPro[]> {
  const body: Record<string, unknown> = {
    textQuery: location ? `${query} near ${nearText}` : `${query} near ${nearText}`,
    maxResultCount: 8,
  };
  if (location) {
    body.locationBias = {
      circle: {
        center: { latitude: location.lat, longitude: location.lng },
        radius: 40000, // ~25 miles, Places API max is 50km
      },
    };
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.reviews",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const data = (await res.json()) as {
    places?: {
      displayName?: { text?: string };
      rating?: number;
      userRatingCount?: number;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      reviews?: { text?: { text?: string } }[];
    }[];
  };
  return (data.places ?? []).map((p) => {
    let distance_note: string | null = p.formattedAddress ?? null;
    if (location && p.location?.latitude != null && p.location?.longitude != null) {
      const mi = milesBetween(location.lat, location.lng, p.location.latitude, p.location.longitude);
      distance_note = `${mi.toFixed(1)} mi from ${location.zip}`;
    }
    return {
      name: p.displayName?.text ?? "Unknown",
      rating: p.rating ?? null,
      review_count: p.userRatingCount ?? null,
      review_excerpt: p.reviews?.[0]?.text?.text?.slice(0, 140) ?? null,
      distance_note,
      address: p.formattedAddress ?? null,
      source: "google_places" as const,
    };
  });
}

function samplePros(query: string, location: ZipLocation | null): LocalPro[] {
  const q = query.toLowerCase();
  const trade = ["plumb", "electric", "hvac", "paint", "pest", "fence", "lawn", "roof"].find((t) =>
    q.includes(t)
  ) ?? "handyman";
  const base = [
    ["Lone Star", 4.6, 213, "Best price of five quotes and the crew was fast."],
    ["Heritage", 4.9, 388, "Premium work — flawless detail and cleanup."],
    ["Alamo", 4.3, 97, "Solid value, communication could be quicker."],
    ["Cedar & Post", 4.7, 154, "Showed up on time and finished a day early."],
  ] as const;
  const suffix: Record<string, string> = {
    plumb: "Plumbing Co.", electric: "Electric", hvac: "Air & Heat", paint: "Painting",
    pest: "Pest Control", fence: "Fence Co.", lawn: "Lawn & Tree", roof: "Roofing", handyman: "Home Services",
  };
  const from = location ? ` from ${location.zip}` : " away";
  return base.map(([name, rating, reviews, excerpt], i) => ({
    name: `${name} ${suffix[trade]}`,
    rating,
    review_count: reviews,
    review_excerpt: `“${excerpt}”`,
    distance_note: `${(1.4 + i * 1.8).toFixed(1)} mi${from}`,
    address: location ? `${location.city}, ${location.state}` : null,
    source: "sample" as const,
  }));
}
