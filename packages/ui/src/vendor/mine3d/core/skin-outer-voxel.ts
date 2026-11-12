// @ts-nocheck
// 3D Skin Layers: extrude outer-пикселей в воксели (порт SolidPixelWrapper / tr7zw)
import type { SkinObject } from "skin3d";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Texture,
} from "three";

const TEX = 64;
/** Как isPresent в моде: любой ненулевой alpha после sanitize */
const ALPHA_PRESENT = 1;

/**
 * Имена граней как в SolidPixelWrapper (Minecraft Direction),
 * не путать с «стороной текстуры»: Top→DOWN, Front→NORTH и т.д.
 */
type McDir = "down" | "up" | "north" | "south" | "west" | "east";

interface PartSpec {
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
  getOuter: (skin: SkinObject) => Mesh;
}

/** Outer UV 64×64 — как skin3d / SkinUtil мода */
function partSpecs(slim: boolean): PartSpec[] {
  const armW = slim ? 3 : 4;
  return [
    { u: 32, v: 0, w: 8, h: 8, d: 8, getOuter: (s) => s.head.outerLayer as Mesh },
    { u: 16, v: 32, w: 8, h: 12, d: 4, getOuter: (s) => s.body.outerLayer as Mesh },
    { u: 40, v: 32, w: armW, h: 12, d: 4, getOuter: (s) => s.rightArm.outerLayer as Mesh },
    { u: 48, v: 48, w: armW, h: 12, d: 4, getOuter: (s) => s.leftArm.outerLayer as Mesh },
    { u: 0, v: 32, w: 4, h: 12, d: 4, getOuter: (s) => s.rightLeg.outerLayer as Mesh },
    { u: 0, v: 48, w: 4, h: 12, d: 4, getOuter: (s) => s.leftLeg.outerLayer as Mesh },
  ];
}

/**
 * Менеджер 3D outer-слоя: прячет плоский outer и ставит merged-воксели.
 */
export class OuterVoxelLayers {
  private readonly _groups: Group[] = [];
  private readonly _geometries: BufferGeometry[] = [];
  /** Плоские outer, которые заменены вокселями — нельзя снова включать setOuterLayerVisible */
  private readonly _replacedOuters: Mesh[] = [];
  /** Общий материал с inner — не dispose (владеет skin3d) */
  private _material: MeshStandardMaterial | null = null;
  /** Клон для полупрозрачных пикселей: inner-материал непрозрачный и съедает alpha */
  private _glass: MeshStandardMaterial | null = null;

  get hasLayers(): boolean {
    return this._groups.length > 0;
  }

  /**
   * Пересобрать 3D-слой из canvas скина.
   * Материал — тот же, что у основного слоя (блик/envMap/яркость).
   */
  rebuild(
    skin: SkinObject,
    canvas: HTMLCanvasElement,
    slim: boolean,
    _skinMap?: Texture | null,
    _envMap?: Texture | null,
  ): void {
    this.clear(skin);

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const { width, height } = canvas;
    if (width < TEX || height < TEX) return;

    const img = ctx.getImageData(0, 0, width, height);
    const scale = width / TEX;

    // Единый PBR с inner (голова/торс) — отражения и тон как у основы
    this._material = (skin.head.innerLayer as Mesh).material as MeshStandardMaterial;

    const base = this._material;
    const glass = base.clone();
    glass.transparent = true;
    glass.depthWrite = false;
    glass.alphaTest = 0;
    this._glass = glass;
    const syncGlass = () => {
      if (glass.map !== base.map || glass.envMap !== base.envMap) {
        glass.map = base.map;
        glass.envMap = base.envMap;
        glass.needsUpdate = true;
      }
      glass.envMapIntensity = base.envMapIntensity;
      glass.roughness = base.roughness;
      glass.metalness = base.metalness;
    };

    for (const spec of partSpecs(slim)) {
      const { solid, translucent } = buildPartVoxels(img.data, width, height, scale, spec);
      if (!solid && !translucent) continue;

      const outer = spec.getOuter(skin);
      const parent = outer.parent;
      if (!parent) {
        solid?.dispose();
        translucent?.dispose();
        continue;
      }

      const group = new Group();
      group.name = "outer3dGroup";
      group.position.copy(outer.position);
      applyShellScale(group, outer, spec.w, spec.h, spec.d);
      if (solid) {
        this._geometries.push(solid);
        const mesh = new Mesh(solid, base);
        mesh.name = "outer3d";
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.renderOrder = 3;
        group.add(mesh);
      }
      if (translucent) {
        this._geometries.push(translucent);
        const mesh = new Mesh(translucent, glass);
        mesh.name = "outer3d";
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.renderOrder = 4;
        mesh.onBeforeRender = syncGlass;
        group.add(mesh);
      }
      parent.add(group);
      this._groups.push(group);

      outer.visible = false;
      this._replacedOuters.push(outer);
    }
  }

  /**
   * Согласовать видимость flat outer / outer3d.
   * Важно: setOuterLayerVisible(true) из skin3d снова показывает заменённые flat —
   * отладка должна звать этот метод вместо него.
   */
  syncVisibility(showOuterLayer: boolean, preferVoxels: boolean): void {
    const useVoxels = preferVoxels && this._groups.length > 0;
    for (const g of this._groups) g.visible = showOuterLayer && useVoxels;
    for (const outer of this._replacedOuters) {
      outer.visible = showOuterLayer && !useVoxels;
    }
  }

  /** Продуктовый режим: воксели вкл., заменённый flat скрыт */
  restoreProductVisibility(): void {
    this.syncVisibility(true, true);
  }

  clear(skin?: SkinObject): void {
    for (const g of this._groups) {
      g.removeFromParent();
    }
    this._groups.length = 0;
    this._replacedOuters.length = 0;

    for (const g of this._geometries) g.dispose();
    this._geometries.length = 0;

    // Материал общий с skin3d — не dispose, клон для полупрозрачных — свой
    this._material = null;
    this._glass?.dispose();
    this._glass = null;

    if (!skin) return;
    for (const spec of partSpecs(false)) {
      try {
        spec.getOuter(skin).visible = true;
      } catch {
        /* ignore */
      }
    }
    try {
      (skin.leftArm.outerLayer as Mesh).visible = true;
      (skin.rightArm.outerLayer as Mesh).visible = true;
    } catch {
      /* ignore */
    }
  }

  dispose(skin?: SkinObject): void {
    this.clear(skin);
  }
}

/** Масштаб оболочки как у stock outer */
function applyShellScale(group: Group, outer: Mesh, w: number, h: number, d: number): void {
  const geom = outer.geometry;
  if (!(geom instanceof BoxGeometry)) {
    group.scale.set(1, 1, 1);
    return;
  }
  const { width, height, depth } = geom.parameters;
  if (width === 1 && height === 1 && depth === 1) {
    group.scale.set(outer.scale.x / w, outer.scale.y / h, outer.scale.z / d);
  } else {
    group.scale.set(width / w, height / h, depth / d);
  }
}

/** Внешняя нормаль сетки грани в осях three (см. modToThreeCenter) */
const FACE_NORMAL: Record<McDir, [number, number, number]> = {
  down: [0, 1, 0],
  up: [0, -1, 0],
  north: [0, 0, 1],
  south: [0, 0, -1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

/** Грань куба: нормаль и касательные (u × v = n), чтобы обход был против часовой снаружи */
const CUBE_FACES: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

interface Voxel {
  mx: number;
  my: number;
  mz: number;
  /** Тексель по направлению внешней нормали сетки, из которой пришёл воксель */
  texels: Map<string, [number, number]>;
  primary: [number, number];
  /** Все тексели вокселя полностью непрозрачны */
  solid: boolean;
}

interface PartVoxels {
  solid?: BufferGeometry;
  translucent?: BufferGeometry;
}

/**
 * Воксели outer-слоя одной геометрией: угловые пиксели соседних граней
 * сливаются в один куб (без z-fighting двойников), а грани, прижатые к
 * соседнему вокселю или к телу, не рисуются — без «разрезов» и в разы
 * меньше треугольников.
 */
function buildPartVoxels(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  scale: number,
  spec: PartSpec,
): PartVoxels {
  const { u, v, w, h, d } = spec;
  const dims = { w, h, d };
  const voxels = new Map<number, Voxel>();
  const keyOf = (mx: number, my: number, mz: number) => (mx * 64 + my) * 64 + mz;

  const faces: McDir[] = ["down", "up", "north", "south", "west", "east"];
  for (const face of faces) {
    const [fuMax, fvMax] = faceSize(dims, face);
    const normalKey = FACE_NORMAL[face].join(",");
    for (let fu = 0; fu < fuMax; fu++) {
      for (let fv = 0; fv < fvMax; fv++) {
        const [tu, tv] = onTextureUV(u, v, dims, face, fu, fv);
        const alpha = alphaAt(data, imgW, imgH, scale, tu, tv);
        if (alpha < ALPHA_PRESENT) continue;
        const [mx, my, mz] = uvToModXYZ(dims, face, fu, fv);
        const key = keyOf(mx, my, mz);
        let voxel = voxels.get(key);
        if (!voxel) {
          voxel = { mx, my, mz, texels: new Map(), primary: [tu, tv], solid: true };
          voxels.set(key, voxel);
        }
        if (alpha < 255) voxel.solid = false;
        voxel.texels.set(normalKey, [tu, tv]);
      }
    }
  }
  if (voxels.size === 0) return {};

  const inside = (mx: number, my: number, mz: number) =>
    mx >= 0 && my >= 0 && mz >= 0 && mx < w && my < h && mz < d;
  const onShell = (mx: number, my: number, mz: number) =>
    mx === 0 || my === 0 || mz === 0 || mx === w - 1 || my === h - 1 || mz === d - 1;

  const solid = new FaceBuffer();
  const translucent = new FaceBuffer();
  const INSET = 0.02;

  for (const voxel of voxels.values()) {
    const [cx, cy, cz] = modToThreeCenter(voxel.mx, voxel.my, voxel.mz, w, h, d);
    for (const { n, u: fu, v: fv } of CUBE_FACES) {
      // three → mod: x тот же, y и z развёрнуты
      const nx = voxel.mx + n[0];
      const ny = voxel.my - n[1];
      const nz = voxel.mz - n[2];
      const [tu, tv] = voxel.texels.get(n.join(",")) ?? voxel.primary;
      const opaque = alphaAt(data, imgW, imgH, scale, tu, tv) >= 255;
      if (inside(nx, ny, nz)) {
        // Грань под полупрозрачным соседом видна сквозь него — её оставляем
        const neighbour = voxels.get(keyOf(nx, ny, nz));
        if (neighbour ? neighbour.solid || !opaque : !onShell(nx, ny, nz)) continue;
      }
      const out = opaque ? solid : translucent;
      const u0 = (tu + INSET) / TEX;
      const u1 = (tu + 1 - INSET) / TEX;
      const v0 = 1 - (tv + 1 - INSET) / TEX;
      const v1 = 1 - (tv + INSET) / TEX;

      const base = out.positions.length / 3;
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        out.positions.push(
          cx + (n[0] + su * fu[0] + sv * fv[0]) * 0.5,
          cy + (n[1] + su * fu[1] + sv * fv[1]) * 0.5,
          cz + (n[2] + su * fu[2] + sv * fv[2]) * 0.5,
        );
        out.normals.push(n[0], n[1], n[2]);
      }
      out.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  return { solid: solid.build(), translucent: translucent.build() };
}

class FaceBuffer {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  build(): BufferGeometry | undefined {
    if (this.indices.length === 0) return undefined;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function faceSize(dims: { w: number; h: number; d: number }, face: McDir): [number, number] {
  if (face === "down" || face === "up") return [dims.w, dims.d];
  if (face === "north" || face === "south") return [dims.w, dims.h];
  return [dims.d, dims.h]; // west / east
}

/** getOnTextureUV — точный порт SolidPixelWrapper */
function onTextureUV(
  texU: number,
  texV: number,
  dims: { w: number; h: number; d: number },
  face: McDir,
  fu: number,
  fv: number,
): [number, number] {
  const { w, d } = dims;
  switch (face) {
    case "down": // Top на атласе
      return [texU + d + fu, texV + fv];
    case "up": // Bottom на атласе
      return [texU + w + d + fu, texV + fv];
    case "north": // Front
      return [texU + d + fu, texV + d + fv];
    case "south": // Back
      return [texU + d + w + d + fu, texV + d + fv];
    case "west": // Left
      return [texU + fu, texV + d + fv];
    case "east": // Right
      return [texU + d + w + fu, texV + d + fv];
  }
}

/** UVtoXYZ — координаты мода (Y вниз по текстуре, NORTH при z=0) */
function uvToModXYZ(
  dims: { w: number; h: number; d: number },
  face: McDir,
  fu: number,
  fv: number,
): [number, number, number] {
  const { w, h, d } = dims;
  switch (face) {
    case "down":
      return [fu, 0, d - 1 - fv];
    case "up":
      return [fu, h - 1, d - 1 - fv];
    case "north":
      return [fu, fv, 0];
    case "south":
      return [w - 1 - fu, fv, d - 1];
    case "west":
      return [0, fv, d - 1 - fu];
    case "east":
      return [w - 1, fv, fu];
  }
}

/**
 * Mod → Three.js (центрированный бокс skin3d):
 * Y вверх, +Z = front (как setSkinUVs → pz).
 */
function modToThreeCenter(
  mx: number,
  my: number,
  mz: number,
  w: number,
  h: number,
  d: number,
): [number, number, number] {
  return [
    mx - w / 2 + 0.5,
    h - 1 - my - h / 2 + 0.5,
    d - 1 - mz - d / 2 + 0.5,
  ];
}

function alphaAt(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  scale: number,
  tu: number,
  tv: number,
): number {
  const x = Math.min(imgW - 1, Math.floor(tu * scale));
  const y = Math.min(imgH - 1, Math.floor(tv * scale));
  if (x < 0 || y < 0 || tu < 0 || tv < 0) return 0;
  return data[(y * imgW + x) * 4 + 3]!;
}
