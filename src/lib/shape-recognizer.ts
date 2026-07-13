// "$1 Unistroke Recognizer" simplificado (Wobbrock, Wobbrock & Li, 2007).
// Usado só como fricção proposital antes de ações destrutivas — não é uma
// medida de segurança de verdade, é um "desenhe pra confirmar".

export type Pt = { x: number; y: number };

const NUM_POINTS = 64;
const SQUARE_SIZE = 250;
const HALF_DIAGONAL = 0.5 * Math.sqrt(SQUARE_SIZE ** 2 + SQUARE_SIZE ** 2);
const ANGLE_RANGE = (45 * Math.PI) / 180;
const ANGLE_PRECISION = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5));

function pathLength(points: Pt[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return d;
}

function resample(points: Pt[], n: number): Pt[] {
  const interval = pathLength(points) / (n - 1) || 1;
  let D = 0;
  const newPoints: Pt[] = [points[0]];
  const pts = points.slice();
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (D + d >= interval) {
      const qx = pts[i - 1].x + ((interval - D) / d) * (pts[i].x - pts[i - 1].x);
      const qy = pts[i - 1].y + ((interval - D) / d) * (pts[i].y - pts[i - 1].y);
      const q = { x: qx, y: qy };
      newPoints.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
  }
  while (newPoints.length < n) newPoints.push(pts[pts.length - 1]);
  return newPoints;
}

function centroid(points: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

function rotateBy(points: Pt[], angle: number): Pt[] {
  const c = centroid(points);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return points.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function rotateToZero(points: Pt[]): Pt[] {
  const c = centroid(points);
  const angle = Math.atan2(c.y - points[0].y, c.x - points[0].x);
  return rotateBy(points, -angle);
}

function scaleToSquare(points: Pt[], size: number): Pt[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  return points.map((p) => ({ x: ((p.x - minX) * size) / w, y: ((p.y - minY) * size) / h }));
}

function translateToOrigin(points: Pt[]): Pt[] {
  const c = centroid(points);
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function pathDistance(a: Pt[], b: Pt[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / a.length;
}

function distanceAtAngle(points: Pt[], template: Pt[], angle: number): number {
  return pathDistance(rotateBy(points, angle), template);
}

function distanceAtBestAngle(points: Pt[], template: Pt[]): number {
  let a = -ANGLE_RANGE, b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = distanceAtAngle(points, template, x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = distanceAtAngle(points, template, x2);
  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 < f2) {
      b = x2; x2 = x1; f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = distanceAtAngle(points, template, x1);
    } else {
      a = x1; x1 = x2; f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = distanceAtAngle(points, template, x2);
    }
  }
  return Math.min(f1, f2);
}

function normalizeStroke(rawPoints: Pt[]): Pt[] {
  let pts = resample(rawPoints, NUM_POINTS);
  pts = rotateToZero(pts);
  pts = scaleToSquare(pts, SQUARE_SIZE);
  pts = translateToOrigin(pts);
  return pts;
}

/** Retorna um score de 0 a 1 — quanto mais perto de 1, mais parecido. */
export function recognize(rawPoints: Pt[], templatePoints: Pt[]): number {
  if (rawPoints.length < 2) return 0;
  const candidate = normalizeStroke(rawPoints);
  const template = normalizeStroke(templatePoints);
  const d = distanceAtBestAngle(candidate, template);
  return Math.max(0, 1 - d / HALF_DIAGONAL);
}
