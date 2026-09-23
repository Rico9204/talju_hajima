// Detects whether a GIF file has more than one frame. Used to reject
// animated GIFs as the full-screen custom background: since the blur filter
// samples the image itself, an animated backdrop forces the browser to
// re-run that filter on every frame tick instead of once — costly anywhere,
// crippling on machines rendering filters in software rather than on the GPU.
//
// Heuristic: count `21 F9 04` (Graphic Control Extension) byte sequences —
// GIF writes one per frame, so more than one means the file animates.
export async function isAnimatedGif(file: File): Promise<boolean> {
  if (file.type !== "image/gif") return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let frames = 0;
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      frames++;
      if (frames > 1) return true;
    }
  }
  return false;
}
