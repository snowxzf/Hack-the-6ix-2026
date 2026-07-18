import { Loader2, MapPin, Navigation } from "lucide-react";
import { useState, type FormEvent } from "react";
import { geocodeCity, type GeocodeResult, type Place } from "../api";
import { useWeather } from "./WeatherProvider";

/**
 * Typed-city location picker with confirmation for ambiguous names
 * ("Toronto, Ontario, Canada — is this right?"). Falls back to GPS when
 * the user clears a manual place.
 */
export function LocationPicker({ compact = false }: { compact?: boolean }) {
  const { location, manualPlace, setManualPlace, coords } = useWeather();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodeResult[] | null>(null);

  function close() {
    setOpen(false);
    setQuery("");
    setCandidates(null);
    setError(null);
  }

  async function search(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    const results = await geocodeCity(q);
    setBusy(false);
    if (!results) {
      setError('No match — try "Toronto, Canada" or a fuller address.');
      return;
    }
    if (results.length === 1) {
      pick(results[0]!);
      return;
    }
    setCandidates(results);
  }

  function pick(r: GeocodeResult) {
    const place: Place = {
      label: r.label,
      lat: r.latitude,
      lon: r.longitude,
    };
    setManualPlace(place);
    close();
  }

  function useGps() {
    setManualPlace(null);
    close();
  }

  if (!open) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 bg-transparent p-0 text-[11px] text-muted-foreground hover:text-primary"
        >
          <MapPin className="h-3 w-3" />
          {location}
          <span className="underline decoration-dotted">change</span>
        </button>
      );
    }
    return (
      <div className="flex items-center justify-between gap-2 border border-border bg-card/85 px-3 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{location}</p>
            <p className="text-[11px] text-muted-foreground">
              {manualPlace
                ? "Typed location"
                : coords?.source === "device"
                  ? "From your phone GPS"
                  : coords?.source === "cached"
                    ? "Last known GPS"
                    : "Default (Toronto)"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 border border-border bg-background px-2.5 py-1 text-xs font-medium"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border border-border bg-card/95 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-lg font-semibold">Where&apos;s your garden?</h3>
        <button
          type="button"
          onClick={close}
          className="bg-transparent p-0 text-xs text-muted-foreground"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={(e) => void search(e)} className="flex gap-2">
        <input
          type="text"
          autoFocus
          placeholder="City or address"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCandidates(null);
          }}
          className="h-10 flex-1 border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="h-10 bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {candidates && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {candidates[0]!.label} — is this right? (or pick another)
          </p>
          {candidates.map((r, i) => (
            <button
              key={`${r.latitude},${r.longitude},${i}`}
              type="button"
              onClick={() => pick(r)}
              className="flex w-full items-center gap-2 border border-border bg-background px-3 py-2.5 text-left text-sm hover:border-primary"
            >
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              {r.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={useGps}
        className="flex w-full items-center justify-center gap-2 border border-dashed border-border bg-transparent py-2 text-xs font-medium text-primary"
      >
        <Navigation className="h-3.5 w-3.5" />
        Use my phone location instead
      </button>
    </div>
  );
}
