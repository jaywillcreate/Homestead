/**
 * Local pro discovery — pluggable provider.
 *
 * The bid-comparison UI needs nearby contractors with ratings and review
 * excerpts. Two providers ship:
 *   - GooglePlacesProvider: live data via the Places API (New) Text Search.
 *     Enabled when GOOGLE_PLACES_API_KEY is set.
 *   - SampleProvider: deterministic illustrative data so the screen works
 *     out of the box with no keys.
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

export async function discoverLocalPros(query: string, near: string): Promise<{ pros: LocalPro[]; source: string }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key) {
    try {
      const pros = await googlePlaces(query, near, key);
      if (pros.length) return { pros, source: "google_places" };
    } catch {
      // fall through to sample data — never break the screen on a provider error
    }
  }
  return { pros: samplePros(query), source: "sample" };
}

async function googlePlaces(query: string, near: string, key: string): Promise<LocalPro[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.reviews",
    },
    body: JSON.stringify({ textQuery: `${query} near ${near}`, maxResultCount: 8 }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const data = (await res.json()) as {
    places?: {
      displayName?: { text?: string };
      rating?: number;
      userRatingCount?: number;
      formattedAddress?: string;
      reviews?: { text?: { text?: string } }[];
    }[];
  };
  return (data.places ?? []).map((p) => ({
    name: p.displayName?.text ?? "Unknown",
    rating: p.rating ?? null,
    review_count: p.userRatingCount ?? null,
    review_excerpt: p.reviews?.[0]?.text?.text?.slice(0, 140) ?? null,
    distance_note: p.formattedAddress ?? null,
    address: p.formattedAddress ?? null,
    source: "google_places" as const,
  }));
}

function samplePros(query: string): LocalPro[] {
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
  return base.map(([name, rating, reviews, excerpt], i) => ({
    name: `${name} ${suffix[trade]}`,
    rating,
    review_count: reviews,
    review_excerpt: `“${excerpt}”`,
    distance_note: `${(1.4 + i * 1.8).toFixed(1)} mi away`,
    address: null,
    source: "sample" as const,
  }));
}
