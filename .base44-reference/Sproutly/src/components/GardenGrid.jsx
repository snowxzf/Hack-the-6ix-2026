import React, { useState, useRef, useEffect } from 'react';

export default function GardenGrid({ cols = 12, rows = 8, onChange }) {
    const [grid, setGrid] = useState(() => Array.from({ length: rows }, () => Array(cols).fill(false)));
    const dragging = useRef(false);
    const mode = useRef(true);

    const report = (g) => {
        const count = g.flat().filter(Boolean).length;
        onChange?.(count);
    };

    const paint = (r, c) => {
        setGrid((g) => {
            if (g[r][c] === mode.current) return g;
            const ng = g.map((row) => [...row]);
            ng[r][c] = mode.current;
            report(ng);
            return ng;
        });
    };

    const onDown = (r, c) => {
        mode.current = !grid[r][c];
        dragging.current = true;
        paint(r, c);
    };

    const onEnter = (r, c) => {
        if (dragging.current) paint(r, c);
    };

    useEffect(() => {
        const up = () => { dragging.current = false; };
        window.addEventListener('pointerup', up);
        return () => window.removeEventListener('pointerup', up);
    }, []);

    const clear = () => {
        const ng = Array.from({ length: rows }, () => Array(cols).fill(false));
        setGrid(ng);
        report(ng);
    };

    const count = grid.flat().filter(Boolean).length;

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Tap or drag to draw your area</p>
                <button onClick={clear} className="text-xs text-primary font-medium">Clear</button>
            </div>
            <div
                className="grid gap-0.5 p-2 bg-secondary/60 border border-border select-none touch-none"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            >
                {grid.map((row, r) =>
                    row.map((on, c) => (
                        <div
                            key={`${r}-${c}`}
                            onPointerDown={() => onDown(r, c)}
                            onPointerEnter={() => onEnter(r, c)}
                            className={`aspect-square border ${on ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                        />
                    ))
                )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
                {count} cells selected · ~{(count * 0.25).toFixed(1)} m²
            </p>
        </div>
    );
}