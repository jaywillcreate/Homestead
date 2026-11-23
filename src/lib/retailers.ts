/**
 * Search links into retailer websites for a material — no API key involved,
 * safe to use in the browser. Each site applies the shopper's own store/ZIP.
 */
export interface RetailerLink {
  name: string;
  url: string;
}

export function retailerLinks(query: string, zip?: string | null): RetailerLink[] {
  // Quotes and slashes (5/8", 4x4x8') break path-style search URLs — plain words search fine.
  const words = query.replace(/["'“”]/g, " ").replace(/\//g, " ").replace(/\s+/g, " ").trim();
  const q = encodeURIComponent(words);
  const near = zip ? encodeURIComponent(`${words} near ${zip}`) : q;
  return [
    { name: "Home Depot", url: `https://www.homedepot.com/s/${q}` },
    { name: "Lowe's", url: `https://www.lowes.com/search?searchTerm=${q}` },
    { name: "Menards", url: `https://www.menards.com/main/search.html?search=${q}` },
    { name: "Ace Hardware", url: `https://www.acehardware.com/search?query=${q}` },
    { name: "Google Shopping", url: `https://www.google.com/search?tbm=shop&q=${near}` },
  ];
}
