import { haversineKm, type LatLng } from "./haversine";

export interface KarachiArea {
  name: string;
  category: "Popular" | "Central" | "East" | "South" | "North" | "Malir & Korangi";
  lat: number;
  lng: number;
  aliases?: string[];
}

export const KARACHI_AREAS: KarachiArea[] = [
  // Popular Hubs
  { name: "Gulshan-e-Iqbal", category: "Popular", lat: 24.9200, lng: 67.0990, aliases: ["gulshan", "gulshan iqbal", "disco bakery", "civic centre", "nipa"] },
  { name: "North Karachi", category: "Popular", lat: 24.9815, lng: 67.0748, aliases: ["north karachi", "new karachi", "power house", "sector 11", "sector 5", "anda mor"] },
  { name: "Clifton", category: "Popular", lat: 24.8138, lng: 67.0299, aliases: ["clifton", "boat basin", "teen talwar", "do talwar", "sea view", "bilawal house"] },
  { name: "DHA (Defence)", category: "Popular", lat: 24.8015, lng: 67.0658, aliases: ["dha", "defence", "phase 5", "phase 6", "phase 2", "khayaban-e-shahbaz", "itwar bazaar"] },
  { name: "Gulistan-e-Jauhar", category: "Popular", lat: 24.9180, lng: 67.1350, aliases: ["jauhar", "gulistan e jauhar", "kamran chowrangi", "jauhar chowrangi", "perfume chowk"] },
  { name: "North Nazimabad", category: "Popular", lat: 24.9425, lng: 67.0400, aliases: ["north nazimabad", "hyderi", "sakhi hassan", "kda", "five star"] },
  { name: "Saddar", category: "Popular", lat: 24.8560, lng: 67.0310, aliases: ["saddar", "empress market", "electronic market", "atrium", "regal"] },
  { name: "Tariq Road & PECHS", category: "Popular", lat: 24.8715, lng: 67.0620, aliases: ["tariq road", "pechs", "bahadurabad", "khalid bin waleed", "allah wali"] },

  // Central
  { name: "Nazimabad", category: "Central", lat: 24.9120, lng: 67.0280, aliases: ["nazimabad 1", "nazimabad 2", "golimar", "chawla market", "abbasi shaheed"] },
  { name: "Federal B Area (F.B Area)", category: "Central", lat: 24.9350, lng: 67.0720, aliases: ["fb area", "f.b area", "water pump", "ayesha manzil", "dastagir", "ancholi"] },
  { name: "Liaquatabad", category: "Central", lat: 24.9080, lng: 67.0420, aliases: ["liaquatabad", "lalukhet", "dak khana", "supermarket"] },
  { name: "Buffer Zone", category: "Central", lat: 24.9650, lng: 67.0620, aliases: ["buffer zone", "shadman", "sector 15"] },
  { name: "New Karachi", category: "Central", lat: 24.9950, lng: 67.0650, aliases: ["new karachi", "godhra", "khamiso goth", "two minute chowrangi"] },

  // East & Shahrah-e-Faisal
  { name: "Bahadurabad", category: "East", lat: 24.8820, lng: 67.0710, aliases: ["bahadurabad", "char minar", "alamgir road"] },
  { name: "Shahrah-e-Faisal", category: "East", lat: 24.8650, lng: 67.0850, aliases: ["shahrah e faisal", "baloch colony", "ftc", "nursery", "lal kothi"] },
  { name: "Karachi Airport & Malir Halt", category: "East", lat: 24.9065, lng: 67.1608, aliases: ["airport", "jinnah terminal", "star gate", "malir halt", "model colony"] },
  { name: "Scheme 33 (Gulzar-e-Hijri)", category: "East", lat: 24.9480, lng: 67.1450, aliases: ["scheme 33", "safoora", "safoora chowrangi", "kiran hospital", "punjabi saudagar"] },
  { name: "Gulshan-e-Maymar", category: "East", lat: 24.9950, lng: 67.1250, aliases: ["maymar", "gulshan e maymar", "tahir villa"] },

  // South
  { name: "DHA Phase 6 & 8", category: "South", lat: 24.7865, lng: 67.0780, aliases: ["phase 6", "phase 8", "ittehad", "bukhari", "creek", "eentee", "dha golf"] },
  { name: "DHA Phase 1 & 2", category: "South", lat: 24.8385, lng: 67.0650, aliases: ["phase 1", "phase 2", "kpt interchange", "sunset boulevard"] },
  { name: "Defence View", category: "South", lat: 24.8300, lng: 67.0750, aliases: ["defence view", "iqra university", "expressway"] },
  { name: "Civil Lines & PIDC", category: "South", lat: 24.8480, lng: 67.0250, aliases: ["civil lines", "pidc", "pc hotel", "movenpick", "club road", "cantt station"] },
  { name: "Burns Road & Artillery Maidan", category: "South", lat: 24.8580, lng: 67.0220, aliases: ["burns road", "fresco", "urdu bazaar", "court"] },
  { name: "Kharadar & Mithadar", category: "South", lat: 24.8520, lng: 67.0010, aliases: ["kharadar", "mithadar", "tower", "denso hall", "jodia bazaar"] },
  { name: "I.I. Chundrigar Road", category: "South", lat: 24.8500, lng: 67.0100, aliases: ["i i chundrigar", "chundrigar road", "mcleod road", "state bank", "habib bank plaza"] },
  { name: "Garden & Lyari", category: "South", lat: 24.8720, lng: 67.0180, aliases: ["garden", "garden east", "garden west", "lyari", "dhobi ghat", "leamarket"] },
  { name: "Mehmoodabad & Manzoor Colony", category: "South", lat: 24.8450, lng: 67.0680, aliases: ["mehmoodabad", "manzoor colony", "baloch colony bridge"] },

  // Malir & Korangi
  { name: "Korangi Industrial Area", category: "Malir & Korangi", lat: 24.8350, lng: 67.1350, aliases: ["korangi", "korangi industrial", "brookes chowrangi", "chamra chowrangi"] },
  { name: "Korangi Crossing & Korangi Town", category: "Malir & Korangi", lat: 24.8250, lng: 67.1150, aliases: ["korangi crossing", "indus hospital", "korangi 2", "korangi 4"] },
  { name: "Malir & Malir City", category: "Malir & Korangi", lat: 24.8950, lng: 67.1850, aliases: ["malir", "malir city", "kala board", "saudabad", "khokhrapar"] },
  { name: "Malir Cantt", category: "Malir & Korangi", lat: 24.9350, lng: 67.1950, aliases: ["malir cantt", "cantt check post", "falcon complex", "askari 5"] },
  { name: "Landhi & Quaidabad", category: "Malir & Korangi", lat: 24.8450, lng: 67.1900, aliases: ["landhi", "quaidabad", "bab-e-khyber", "dawood chowrangi", "hospital chauraha"] },

  // Industrial & West
  { name: "S.I.T.E Industrial Area", category: "Central", lat: 24.8980, lng: 67.0050, aliases: ["site", "site area", "ghani chowrangi", "habib bank chowrangi", "siemens"] },
  { name: "Orangi Town", category: "North", lat: 24.9450, lng: 66.9950, aliases: ["orangi", "orangi town", "banaras", "qasba colony"] },
];

export interface SearchResult {
  name: string;
  detail?: string;
  lat: number;
  lng: number;
  source: "local" | "osm";
}

/**
 * Searches Karachi locations locally first with instant fuzzy/token matching,
 * then queries OpenStreetMap Nominatim for specific addresses.
 */
export async function searchKarachiLocations(query: string, limit = 6): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  // 1. Local Search (Instant, 0ms, zero-network, handles typos & aliases)
  const tokens = q.split(/\s+/).filter(Boolean);
  const localMatches: SearchResult[] = [];

  for (const area of KARACHI_AREAS) {
    const areaName = area.name.toLowerCase();
    const aliases = (area.aliases || []).join(" ").toLowerCase();
    const fullText = `${areaName} ${aliases} ${area.category.toLowerCase()}`;

    // Exact or prefix match scores highest
    let matches = false;
    if (areaName.includes(q) || aliases.includes(q)) {
      matches = true;
    } else {
      // All tokens appear somewhere
      matches = tokens.every((t) => fullText.includes(t));
    }

    if (matches) {
      localMatches.push({
        name: area.name,
        detail: `${area.category} Karachi`,
        lat: area.lat,
        lng: area.lng,
        source: "local",
      });
    }

    if (localMatches.length >= limit) break;
  }

  // If local results are sufficient, return them immediately
  if (localMatches.length >= 3) {
    return localMatches;
  }

  // 2. OpenStreetMap Nominatim Search (bounded to Karachi area)
  try {
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ", Karachi")}&countrycodes=pk&viewbox=66.8,25.15,67.35,24.7&bounded=0&limit=5`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "LogiPulse-Karachi-Courier" },
    });
    if (res.ok) {
      const data = await res.json();
      const osmResults: SearchResult[] = data.map((item: { display_name: string; lat: string; lon: string }) => {
        // Shorten the display name for clean UI
        const parts = item.display_name.split(",").map((s) => s.trim());
        const shortName = parts.slice(0, 3).join(", ");
        return {
          name: shortName,
          detail: parts.slice(3, 5).join(", ") || "Karachi, Pakistan",
          lat: Number(parseFloat(item.lat).toFixed(6)),
          lng: Number(parseFloat(item.lon).toFixed(6)),
          source: "osm" as const,
        };
      });

      // Combine local + OSM, deduplicating by proximity
      const combined = [...localMatches];
      for (const osm of osmResults) {
        const isDuplicate = combined.some(
          (c) => haversineKm({ lat: c.lat, lng: c.lng }, { lat: osm.lat, lng: osm.lng }) < 0.5
        );
        if (!isDuplicate) {
          combined.push(osm);
        }
      }
      return combined.slice(0, limit);
    }
  } catch {
    // If offline or network error, local results are always reliable
  }

  return localMatches;
}

/** Finds the closest named Karachi area to given coordinates */
export function findNearestKarachiArea(pt: LatLng): { name: string; distanceKm: number } | null {
  let nearest: KarachiArea | null = null;
  let minD = Infinity;

  for (const a of KARACHI_AREAS) {
    const d = haversineKm(pt, { lat: a.lat, lng: a.lng });
    if (d < minD) {
      minD = d;
      nearest = a;
    }
  }

  if (nearest) {
    return { name: nearest.name, distanceKm: Number(minD.toFixed(2)) };
  }
  return null;
}
