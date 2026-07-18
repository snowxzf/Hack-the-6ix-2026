import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Camera,
  ExternalLink,
  ImagePlus,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  identifyPlant,
  type IdentifyCandidate,
  type IdentifyResult,
  type IdentifyWikipedia,
} from "../api";
import {
  savedPlantFromIdentify,
  useSavedPlants,
} from "../lib/savedPlants";

type Phase = "capture" | "loading" | "miss" | "card";

function confidencePct(score?: number): number | null {
  if (score == null || Number.isNaN(score)) return null;
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

function PlantPlayerCard(props: {
  candidate: IdentifyCandidate;
  wikipedia?: IdentifyWikipedia | null;
  previewUrl?: string | null;
  attribution?: string;
  onClose: () => void;
  onRetake: () => void;
}) {
  const { candidate, wikipedia } = props;
  const pn = candidate.plantnet;
  const care = candidate.catalogMatch;
  const { isSaved, save } = useSavedPlants();

  const scientific =
    pn?.scientificNameWithoutAuthor ??
    pn?.scientificName ??
    care?.scientificName ??
    "Unknown";
  const common =
    care?.name ?? pn?.commonNames?.[0] ?? wikipedia?.title ?? scientific;
  const image =
    wikipedia?.image ||
    wikipedia?.thumbnail ||
    pn?.images?.[0] ||
    props.previewUrl ||
    null;
  const speciesId =
    care?.id ?? candidate.species?.id ?? `saved:${scientific.toLowerCase()}`;
  const saved = isSaved(speciesId);
  const [justSaved, setJustSaved] = useState(false);
  const pct = confidencePct(candidate.score);

  function onSave() {
    const plant = savedPlantFromIdentify(candidate, wikipedia);
    save(plant);
    setJustSaved(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 pt-2">
      <div className="relative overflow-hidden border border-border bg-card shadow-lg">
        <div className="relative aspect-[4/5] w-full bg-[hsl(var(--palette-sage)/0.35)]">
          {image ? (
            <img src={image} alt={common} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No reference photo
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
            <p className="font-heading text-4xl font-semibold leading-tight drop-shadow">
              {common}
            </p>
            <p className="mt-1 text-sm italic text-white/90">{scientific}</p>
            {pct != null && (
              <span className="mt-2 inline-block bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                {pct}% match
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {pn?.genus && (
              <div className="border border-border bg-secondary/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Genus
                </p>
                <p className="font-medium">{pn.genus}</p>
              </div>
            )}
            {pn?.family && (
              <div className="border border-border bg-secondary/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Family
                </p>
                <p className="font-medium">{pn.family}</p>
              </div>
            )}
            {care?.sun && (
              <div className="border border-border bg-secondary/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Sun
                </p>
                <p className="font-medium capitalize">{care.sun}</p>
              </div>
            )}
            {care?.waterEveryDays != null && (
              <div className="border border-border bg-secondary/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Water
                </p>
                <p className="font-medium">Every {care.waterEveryDays}d</p>
              </div>
            )}
          </div>

          {(pn?.commonNames?.length ?? 0) > 1 && (
            <p className="text-xs text-muted-foreground">
              Also called: {pn!.commonNames!.slice(0, 4).join(", ")}
            </p>
          )}

          {wikipedia?.description && (
            <p className="text-xs font-medium text-primary">{wikipedia.description}</p>
          )}

          {wikipedia?.extract && (
            <p className="text-sm leading-relaxed text-foreground/85">
              {wikipedia.extract}
            </p>
          )}

          {wikipedia?.url && (
            <a
              href={wikipedia.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Read more on Wikipedia
            </a>
          )}

          {care && (
            <div className="border border-border bg-secondary/30 p-3 text-xs leading-relaxed text-muted-foreground">
              Matched PlotTwist catalog care for <b className="text-foreground">{care.name}</b>
              {care.heightCm != null ? ` · ~${care.heightCm} cm tall` : ""}
              {care.daysToHarvest != null ? ` · harvest ~${care.daysToHarvest}d` : ""}
            </div>
          )}

          {props.attribution && (
            <p className="text-[10px] leading-relaxed text-muted-foreground/80">
              {props.attribution}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saved || justSaved}
          className="flex h-11 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-70"
        >
          {saved || justSaved ? (
            <>
              <BookmarkCheck className="h-4 w-4" />
              Saved to profile
            </>
          ) : (
            <>
              <Bookmark className="h-4 w-4" />
              Save this plant
            </>
          )}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={props.onRetake}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 border border-border bg-card text-sm font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retake
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="flex h-10 flex-1 items-center justify-center border border-border bg-card text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlantIdentifyFlow(props: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function resetToCapture() {
    setPhase("capture");
    setError(null);
    setResult(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function onFile(file: File) {
    if (file.type && !file.type.startsWith("image/")) {
      setError("Please choose an image (JPG or PNG).");
      setPhase("miss");
      return;
    }
    setError(null);
    setResult(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPhase("loading");

    const outcome = await identifyPlant(file);
    if (!outcome.ok) {
      setError(outcome.error);
      setPhase("miss");
      return;
    }

    const data = outcome.data;
    const top =
      data.bestMatch ??
      data.candidates?.find((c) => (c.score ?? 0) >= 0.05) ??
      null;
    const detected = data.detected !== false && top != null;

    if (!detected) {
      setError("Couldn’t identify a plant: try a closer photo of a leaf or flower.");
      setPhase("miss");
      return;
    }

    setResult(data);
    setPhase("card");
  }

  const top =
    result?.bestMatch ??
    result?.candidates?.[0] ??
    null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[hsl(var(--palette-cream)/0.97)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-3">
        <button
          type="button"
          onClick={phase === "capture" ? props.onClose : resetToCapture}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {phase === "capture" ? (
            <>
              <X className="h-4 w-4" />
              Close
            </>
          ) : (
            <>
              <ArrowLeft className="h-4 w-4" />
              Back
            </>
          )}
        </button>
        <h2 className="font-heading text-2xl font-semibold">Identify</h2>
        <span className="w-14" />
      </header>

      {phase === "capture" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
          <div className="flex h-28 w-28 items-center justify-center border-2 border-dashed border-primary/40 bg-primary/5">
            <Camera className="h-12 w-12 text-primary" />
          </div>
          <div className="space-y-1 text-center">
            <p className="font-heading text-3xl font-semibold">Learn on the go</p>
            <p className="text-sm text-muted-foreground">
              Snap a flower or leaf: PlantNet IDs it, Wikipedia fills in the story.
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex h-12 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground"
            >
              <Camera className="h-4 w-4" />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-11 items-center justify-center gap-2 border border-border bg-card text-sm font-medium"
            >
              <ImagePlus className="h-4 w-4" />
              Upload from library
            </button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground/80">
            Fill the frame with one plant. Blurry wide shots confuse the model.
          </p>
        </div>
      )}

      {phase === "loading" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          {preview && (
            <img
              src={preview}
              alt=""
              className="h-40 w-40 object-cover opacity-70"
            />
          )}
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="space-y-1 text-center">
            <p className="font-heading text-3xl font-semibold">Identifying…</p>
            <p className="text-sm text-muted-foreground">
              Asking PlantNet, then fetching Wikipedia.
            </p>
          </div>
        </div>
      )}

      {phase === "miss" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          {preview && (
            <img
              src={preview}
              alt=""
              className="h-36 w-36 object-cover opacity-60"
            />
          )}
          <div className="space-y-2 text-center">
            <p className="font-heading text-3xl font-semibold">Not detected</p>
            <p className="text-sm text-muted-foreground" role="alert">
              {error ?? "Try again with a clearer close-up."}
            </p>
          </div>
          <button
            type="button"
            onClick={resetToCapture}
            className="flex h-11 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Retake photo
          </button>
        </div>
      )}

      {phase === "card" && top && (
        <PlantPlayerCard
          candidate={top}
          wikipedia={result?.wikipedia}
          previewUrl={preview}
          attribution={result?.attribution}
          onClose={props.onClose}
          onRetake={resetToCapture}
        />
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
    </div>
  );
}
