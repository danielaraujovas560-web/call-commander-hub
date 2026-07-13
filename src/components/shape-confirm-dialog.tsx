import { useEffect, useRef, useState } from "react";
import { recognize, type Pt } from "@/lib/shape-recognizer";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Check } from "lucide-react";

const SIZE = 300;
const MATCH_THRESHOLD = 0.75;

function circleTemplate(): Pt[] {
  const pts: Pt[] = [];
  const cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2 - 30;
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function starTemplate(): Pt[] {
  const cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2 - 30;
  const verts: Pt[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return [0, 2, 4, 1, 3, 0].map((i) => verts[i]);
}

const SHAPES: Record<string, { label: string; points: Pt[] }> = {
  triangulo: { label: "um triângulo", points: [{ x: 150, y: 30 }, { x: 30, y: 270 }, { x: 270, y: 270 }, { x: 150, y: 30 }] },
  quadrado: { label: "um quadrado", points: [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 250 }, { x: 50, y: 250 }, { x: 50, y: 50 }] },
  circulo: { label: "um círculo", points: circleTemplate() },
  check: { label: "um check (✓)", points: [{ x: 40, y: 160 }, { x: 110, y: 230 }, { x: 260, y: 40 }] },
  estrela: { label: "uma estrela", points: starTemplate() },
};
const SHAPE_KEYS = Object.keys(SHAPES);

function pointsToPath(points: Pt[]): string {
  if (!points.length) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function ShapeConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Apagar", confirming = false, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirming?: boolean;
  onConfirm: () => void;
}) {
  const [shapeKey, setShapeKey] = useState(SHAPE_KEYS[0]);
  const [drawing, setDrawing] = useState<Pt[]>([]);
  const [matched, setMatched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (open) {
      setShapeKey(SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)]);
      setDrawing([]);
      setMatched(false);
      setAttempted(false);
    }
  }, [open]);

  const shape = SHAPES[shapeKey];

  function toLocalPoint(clientX: number, clientY: number): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * SIZE, y: ((clientY - rect.top) / rect.height) * SIZE };
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    isDrawing.current = true;
    setMatched(false);
    setAttempted(false);
    setDrawing([toLocalPoint(e.clientX, e.clientY)]);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!isDrawing.current) return;
    setDrawing((prev) => [...prev, toLocalPoint(e.clientX, e.clientY)]);
  }

  function handlePointerUp() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setAttempted(true);
    setDrawing((prev) => {
      if (prev.length >= 2) setMatched(recognize(prev, shape.points) >= MATCH_THRESHOLD);
      return prev;
    });
  }

  function handleReset() {
    setDrawing([]);
    setMatched(false);
    setAttempted(false);
  }

  function handleShuffle() {
    let next = shapeKey;
    while (next === shapeKey) next = SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
    setShapeKey(next);
    handleReset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Essa ação é irreversível."} Para confirmar, desenhe <strong>{shape.label}</strong> na área abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="w-full aspect-square touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <path d={pointsToPath(shape.points)} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} strokeDasharray="6 6" />
            <path
              d={pointsToPath(drawing)}
              fill="none"
              stroke={matched ? "#16a34a" : attempted ? "#dc2626" : "#2563eb"}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className={matched ? "text-green-600" : attempted ? "text-destructive" : "text-muted-foreground"}>
            {matched ? "Desenho reconhecido ✓" : attempted ? "Não bateu, tenta de novo" : "Desenhe a forma acima"}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleShuffle}>
              Trocar forma
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={!matched || confirming} onClick={onConfirm}>
            <Check className="h-4 w-4 mr-1" />
            {confirming ? "Apagando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
