import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface PlateSearchVehicle {
  id: number;
  licensePlate: string | null;
  color: string | null;
  status: string | null;
  vehicleModel: {
    id: number;
    name: string | null;
    brand: { id: number; name: string | null } | null;
  } | null;
}

interface PlateSearchInputProps {
  vehicles: PlateSearchVehicle[];
  selected: PlateSearchVehicle | null;
  onSelect: (v: PlateSearchVehicle) => void;
  onClear: () => void;
  loading?: boolean;
  /** Static city label appended to each suggestion (e.g. "Tbilisi"). */
  cityLabel?: string;
  placeholder?: string;
  /** Debounce in ms before suggestions update. Default 250. */
  debounceMs?: number;
  /** Min query length before suggestions render. Default 2. */
  minChars?: number;
  /** Max suggestions shown. Default 10. */
  maxResults?: number;
}

/**
 * Reusable plate-first vehicle autocomplete.
 *
 * Ranks matches: plate prefix > plate substring > brand/model substring.
 * Pure client-side filter over the supplied `vehicles` list — caller is
 * responsible for fetching & scoping (e.g. by city/status).
 */
export function PlateSearchInput({
  vehicles,
  selected,
  onSelect,
  onClear,
  loading,
  cityLabel,
  placeholder,
  debounceMs = 250,
  minChars = 2,
  maxResults = 10,
}: PlateSearchInputProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Sync the input when a vehicle is picked externally
  useEffect(() => {
    if (selected) setQuery(selected.licensePlate ?? "");
  }, [selected]);

  // Debounce the query before recomputing matches
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  // Outside click closes dropdown
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const matches = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q.length < minChars) return [];
    const prefix: PlateSearchVehicle[] = [];
    const platesub: PlateSearchVehicle[] = [];
    const meta: PlateSearchVehicle[] = [];
    for (const v of vehicles) {
      const plate = (v.licensePlate ?? "").toLowerCase();
      const brand = (v.vehicleModel?.brand?.name ?? "").toLowerCase();
      const model = (v.vehicleModel?.name ?? "").toLowerCase();
      if (plate.startsWith(q)) prefix.push(v);
      else if (plate.includes(q)) platesub.push(v);
      else if (brand.includes(q) || model.includes(q)) meta.push(v);
      if (prefix.length + platesub.length + meta.length >= maxResults * 3) break;
    }
    return [...prefix, ...platesub, ...meta].slice(0, maxResults);
  }, [debouncedQuery, vehicles, minChars, maxResults]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
        <div className="min-w-0">
          <p className="text-sm font-mono font-bold tracking-wider text-foreground">
            {selected.licensePlate ?? `#${selected.id}`}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {[selected.vehicleModel?.brand?.name, selected.vehicleModel?.name].filter(Boolean).join(" ") || "—"}
            {selected.color ? ` · ${selected.color}` : ""}
            {cityLabel ? ` · ${cityLabel}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            setQuery("");
            setDebouncedQuery("");
            setOpen(false);
            onClear();
          }}
          title="Clear"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={loading ? "Loading vehicles…" : placeholder ?? "Type plate, brand or model…"}
        className="pl-9 font-mono uppercase tracking-wider"
        autoComplete="off"
      />
      {open && debouncedQuery.trim().length >= minChars && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matches.</div>
          ) : (
            matches.map((v) => {
              const meta = [v.vehicleModel?.brand?.name, v.vehicleModel?.name].filter(Boolean).join(" ");
              const tail = [meta || "—", cityLabel].filter(Boolean).join(" · ");
              return (
                <button
                  key={v.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center justify-between gap-2"
                  onClick={() => {
                    onSelect(v);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-bold tracking-wider truncate">
                      {v.licensePlate ?? `#${v.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{tail}</p>
                  </div>
                  {v.color && <span className="text-[10px] text-muted-foreground flex-shrink-0">{v.color}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
