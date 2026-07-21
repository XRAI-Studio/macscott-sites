import * as THREE from "three";

export const MAX_ORBS = 24;
const MAX_SPEED = 1.4;
const MIN_DISTANCE = 5.2;
const MAX_DISTANCE = 10.8;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function random(seed: number) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967295; }

export function slugAnchor(slug: string): [number, number, number] {
  const seed = hash(slug);
  return [(random(seed) - .5) * 7.2, (random(seed ^ 0x9e3779b9) - .5) * 4.6, (random(seed ^ 0x85ebca6b) - .5) * 3.8];
}

export class SimulationState {
  readonly count: number;
  readonly anchors: Float32Array;
  readonly positions: Float32Array;
  readonly renderPositions: Float32Array;
  readonly velocities: Float32Array;
  readonly states: Float32Array;
  private readonly snapshot: Float32Array;
  private readonly impulses: Float32Array;
  private readonly projected: Float32Array;
  private readonly seeds: Float32Array;
  private readonly point = new THREE.Vector3();

  constructor(slugs: string[]) {
    this.count = Math.min(slugs.length, MAX_ORBS);
    this.anchors = new Float32Array(this.count * 3);
    this.positions = new Float32Array(this.count * 3);
    this.renderPositions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.states = new Float32Array(this.count);
    this.snapshot = new Float32Array(this.count * 3);
    this.impulses = new Float32Array(this.count * 3);
    this.projected = new Float32Array(this.count * 3);
    this.seeds = new Float32Array(this.count);
    for (let index = 0; index < this.count; index += 1) {
      const anchor = slugAnchor(slugs[index]);
      const offset = index * 3;
      this.anchors.set(anchor, offset); this.positions.set(anchor, offset); this.renderPositions.set(anchor, offset);
      this.seeds[index] = hash(slugs[index]) / 4294967295;
    }
  }

  step(rawDelta: number, time: number, camera: THREE.Camera | null, pointerX = 0, pointerY = 0, hovered = -1, frozen = -1) {
    const delta = Math.min(Math.max(rawDelta, 0), 1 / 30);
    const matrix = camera?.matrixWorld.elements;
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 3;
      if (index === frozen) { this.velocities[offset] = 0; this.velocities[offset + 1] = 0; this.velocities[offset + 2] = 0; continue; }
      const phase = time * .19 + this.seeds[index] * 31, px = this.positions[offset], py = this.positions[offset + 1], pz = this.positions[offset + 2];
      const spring = index === hovered ? .31 : .12;
      this.velocities[offset] += ((Math.sin(py * .7 + phase) - Math.cos(pz * .6 - phase)) * .16 + (this.anchors[offset] - px) * spring) * delta;
      this.velocities[offset + 1] += ((Math.sin(pz * .65 + phase) - Math.cos(px * .55 - phase)) * .14 + (this.anchors[offset + 1] - py) * spring) * delta;
      this.velocities[offset + 2] += ((Math.sin(px * .6 + phase) - Math.cos(py * .7 - phase)) * .15 + (this.anchors[offset + 2] - pz) * spring) * delta;
      this.positions[offset] += this.velocities[offset] * delta; this.positions[offset + 1] += this.velocities[offset + 1] * delta; this.positions[offset + 2] += this.velocities[offset + 2] * delta;
    }
    for (let iteration = 0; iteration < 2; iteration += 1) {
      this.snapshot.set(this.positions); this.impulses.fill(0);
      if (camera) for (let index = 0; index < this.count; index += 1) {
        const offset = index * 3; this.point.set(this.snapshot[offset], this.snapshot[offset + 1], this.snapshot[offset + 2]).project(camera);
        this.projected[offset] = this.point.x; this.projected[offset + 1] = this.point.y; this.projected[offset + 2] = this.point.z;
      }
      for (let left = 0; left < this.count; left += 1) for (let right = left + 1; right < this.count; right += 1) {
        const a = left * 3, b = right * 3;
        let dx = this.snapshot[a] - this.snapshot[b], dy = this.snapshot[a + 1] - this.snapshot[b + 1], dz = this.snapshot[a + 2] - this.snapshot[b + 2];
        let distance = Math.hypot(dx, dy, dz) || .0001;
        if (distance < 2.05) {
          const force = (2.05 - distance) * .22 / distance; dx *= force; dy *= force; dz *= force;
          this.impulses[a] += dx; this.impulses[a + 1] += dy; this.impulses[a + 2] += dz; this.impulses[b] -= dx; this.impulses[b + 1] -= dy; this.impulses[b + 2] -= dz;
        }
        if (camera && matrix) {
          const sx = this.projected[a] - this.projected[b], sy = this.projected[a + 1] - this.projected[b + 1]; distance = Math.hypot(sx, sy) || .0001;
          if (distance < .22) {
            const force = (.22 - distance) * .32 / distance, px = sx * force, py = sy * force;
            dx = matrix[0] * px + matrix[4] * py; dy = matrix[1] * px + matrix[5] * py; dz = matrix[2] * px + matrix[6] * py;
            this.impulses[a] += dx; this.impulses[a + 1] += dy; this.impulses[a + 2] += dz; this.impulses[b] -= dx; this.impulses[b + 1] -= dy; this.impulses[b + 2] -= dz;
          }
        }
      }
      for (let index = 0; index < this.count * 3; index += 1) this.positions[index] += this.impulses[index];
    }
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 3;
      let speed = Math.hypot(this.velocities[offset], this.velocities[offset + 1], this.velocities[offset + 2]);
      if (speed > MAX_SPEED) { speed = MAX_SPEED / speed; this.velocities[offset] *= speed; this.velocities[offset + 1] *= speed; this.velocities[offset + 2] *= speed; }
      if (camera && matrix) {
        let dx = this.positions[offset] - camera.position.x, dy = this.positions[offset + 1] - camera.position.y, dz = this.positions[offset + 2] - camera.position.z;
        const distance = Math.hypot(dx, dy, dz) || 1; const bounded = THREE.MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE); const scale = bounded / distance;
        this.positions[offset] = camera.position.x + dx * scale; this.positions[offset + 1] = camera.position.y + dy * scale; this.positions[offset + 2] = camera.position.z + dz * scale;
        this.point.set(this.positions[offset], this.positions[offset + 1], this.positions[offset + 2]).project(camera);
        const screenX = THREE.MathUtils.clamp(this.point.x, -.72, .72), screenY = THREE.MathUtils.clamp(this.point.y, -.68, .68);
        dx = (screenX - this.point.x) * bounded * .5; dy = (screenY - this.point.y) * bounded * .5;
        this.positions[offset] += matrix[0] * dx + matrix[4] * dy; this.positions[offset + 1] += matrix[1] * dx + matrix[5] * dy; this.positions[offset + 2] += matrix[2] * dx + matrix[6] * dy;
      }
      const bob = index === frozen ? 0 : Math.sin(time * .72 + this.seeds[index] * 19) * .1, parallax = index === frozen ? 0 : 1;
      this.renderPositions[offset] = this.positions[offset] + pointerX * .08 * parallax; this.renderPositions[offset + 1] = this.positions[offset + 1] + bob + pointerY * .08 * parallax; this.renderPositions[offset + 2] = this.positions[offset + 2];
      this.states[index] = index === hovered ? 1 : .34;
    }
  }
}
