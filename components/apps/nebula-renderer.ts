import * as THREE from "three";

type Tier = "full" | "lite";
type Failure = () => void;
type RendererConstructor = (parameters: THREE.WebGLRendererParameters) => THREE.WebGLRenderer;
type RendererCanvas = {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  setAttribute(name: string, value: string): void;
};

export function createNebulaRenderer(defaults: THREE.WebGLRendererParameters, tier: Tier, onFailure: Failure, create: RendererConstructor = (parameters) => new THREE.WebGLRenderer(parameters)) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = create({ ...defaults, antialias: tier === "full", powerPreference: tier === "full" ? "high-performance" : "low-power" });
  } catch (error) {
    console.error("Nebula WebGL2 renderer creation failed", error);
    onFailure();
    throw error;
  }
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (context, program, vertexShader, fragmentShader) => {
    console.error("Nebula shader compile/link failure", { program: context.getProgramInfoLog(program), vertex: context.getShaderInfoLog(vertexShader), fragment: context.getShaderInfoLog(fragmentShader) });
    onFailure();
  };
  return renderer;
}

export function installRendererContextHandlers(canvas: RendererCanvas, onFailure: Failure) {
  function handleContextLost(event: Event) { event.preventDefault(); onFailure(); }
  function handleContextRestored() { canvas.setAttribute("aria-hidden", "true"); }
  canvas.setAttribute("aria-hidden", "true");
  canvas.addEventListener("webglcontextlost", handleContextLost); canvas.addEventListener("webglcontextrestored", handleContextRestored);
  return () => { canvas.removeEventListener("webglcontextlost", handleContextLost); canvas.removeEventListener("webglcontextrestored", handleContextRestored); };
}
