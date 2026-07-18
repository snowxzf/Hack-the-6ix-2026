import type { Species } from "../../../optimizer/src/index";
import { useSavedPlants } from "../lib/savedPlants";

/** <select> options: catalog + saved PlantNet discoveries as an extra group. */
export function SpeciesSelectOptions(props: {
  catalog: Species[];
  value?: string;
}) {
  const { plants: saved } = useSavedPlants();
  const catalogIds = new Set(props.catalog.map((s) => s.id));
  const extras = saved.filter((p) => !catalogIds.has(p.speciesId));

  return (
    <>
      {extras.length > 0 && (
        <optgroup label="Saved from camera">
          {extras.map((p) => (
            <option key={p.speciesId} value={p.speciesId}>
              ★ {p.commonName}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Catalog">
        {props.catalog.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.cellsPerPlant
              ? ` (${s.cellsPerPlant[0]}×${s.cellsPerPlant[1]})`
              : ""}
          </option>
        ))}
      </optgroup>
    </>
  );
}
