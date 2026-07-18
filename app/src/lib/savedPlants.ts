import { useEffect, useState } from "react";
import type { Species, SkillTier } from "../../../optimizer/src/index";
import type { IdentifyCandidate, IdentifyWikipedia } from "../api";

const SAVED_KEY = "plottwist:savedPlants";
const SAVED_EVENT = "plottwist:savedPlants";

export interface SavedPlant {
  id: string;
  /** Species id usable in garden dropdowns / optimizer. */
  speciesId: string;
  commonName: string;
  scientificName: string;
  genus?: string;
  family?: string;
  score?: number;
  image?: string;
  wikipediaExtract?: string;
  wikipediaUrl?: string;
  wikipediaDescription?: string;
  catalogId?: string;
  savedAt: number;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function loadSavedPlants(): SavedPlant[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPlant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(plants: SavedPlant[]): SavedPlant[] {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(plants));
    window.dispatchEvent(new Event(SAVED_EVENT));
  } catch {
    /* best-effort */
  }
  return plants;
}

export function isPlantSaved(speciesId: string): boolean {
  return loadSavedPlants().some((p) => p.speciesId === speciesId);
}

/** Build a SavedPlant (+ species id) from an identify result. */
export function savedPlantFromIdentify(
  candidate: IdentifyCandidate,
  wikipedia?: IdentifyWikipedia | null,
): SavedPlant {
  const pn = candidate.plantnet;
  const catalog = candidate.catalogMatch;
  const scientific =
    pn?.scientificNameWithoutAuthor ??
    pn?.scientificName ??
    catalog?.scientificName ??
    "Unknown plant";
  const common =
    catalog?.name ??
    pn?.commonNames?.[0] ??
    wikipedia?.title ??
    scientific;
  const speciesId =
    catalog?.id ??
    (candidate.species?.id as string | undefined) ??
    `saved:${slugify(scientific) || "plant"}`;

  const image =
    wikipedia?.image ||
    wikipedia?.thumbnail ||
    pn?.images?.[0] ||
    undefined;

  return {
    id: `sp-${Date.now()}-${slugify(scientific).slice(0, 12) || "plant"}`,
    speciesId,
    commonName: common,
    scientificName: scientific,
    genus: pn?.genus,
    family: pn?.family,
    score: candidate.score,
    image,
    wikipediaExtract: wikipedia?.extract,
    wikipediaUrl: wikipedia?.url,
    wikipediaDescription: wikipedia?.description,
    catalogId: catalog?.id,
    savedAt: Date.now(),
  };
}

export function savePlant(plant: SavedPlant): SavedPlant[] {
  const prev = loadSavedPlants();
  const without = prev.filter(
    (p) => p.speciesId !== plant.speciesId && p.scientificName !== plant.scientificName,
  );
  return persist([plant, ...without].slice(0, 40));
}

export function removeSavedPlant(id: string): SavedPlant[] {
  return persist(loadSavedPlants().filter((p) => p.id !== id));
}

/** Turn a saved discovery into an optimizer Species (defaults for garden use). */
export function savedPlantToSpecies(plant: SavedPlant): Species {
  return {
    id: plant.speciesId,
    name: plant.commonName,
    tier: "beginner" as SkillTier,
    category: "identified",
    cellsPerPlant: [1, 1],
    sun: "full",
    waterEveryDays: 3,
    heightCm: 40,
    yieldKgPerSeason: 0,
    co2eSavedPerKg: 0,
    companions: [],
  };
}

/** Catalog plants first, then saved discoveries not already in the catalog. */
export function mergeCatalogWithSaved(catalog: Species[]): Species[] {
  const ids = new Set(catalog.map((s) => s.id));
  const extras = loadSavedPlants()
    .filter((p) => !ids.has(p.speciesId))
    .map(savedPlantToSpecies);
  return [...catalog, ...extras];
}

export function useSavedPlants() {
  const [plants, setPlants] = useState<SavedPlant[]>(() => loadSavedPlants());

  useEffect(() => {
    const refresh = () => setPlants(loadSavedPlants());
    window.addEventListener(SAVED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SAVED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return {
    plants,
    save: (p: SavedPlant) => setPlants(savePlant(p)),
    remove: (id: string) => setPlants(removeSavedPlant(id)),
    isSaved: (speciesId: string) => plants.some((p) => p.speciesId === speciesId),
  };
}
