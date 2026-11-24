// The Wind turbine's rotor, modeled and lit to go with the painted tower (after nano-test/turbine/make.mjs, whose numbers
// it keeps): `rotor(THREE, cfg, n)` in a page gives n frames of a third of a turn, RGBA, the hub's plate at (ox, oy).
// The axis is fitted to the painting on screen (the plate's ellipse), not to a 3D camera.
export function rotorFrames(THREE, { w, h, ox, oy, L, axis, n, key, hemi }) {
  const PI = Math.PI, SS = 4, renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  const mat = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const M = { white: mat(0xf4f0ec, 0.78), dark: mat(0x565961, 0.6, 0.2), seam: mat(0x9a9ca4, 0.8) };
  const add = (g, geo, m, x = 0, y = 0, z = 0, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const blade = new THREE.Shape(); [[0.07, 0.14], [0.14, 0.30], [0.21, 0.55], [0.21, 0.86], [0.11, 1.0], [-0.08, 1.0], [-0.23, 0.87], [-0.26, 0.58], [-0.15, 0.30], [-0.07, 0.14]].forEach(([x, y], i) => blade[i ? 'lineTo' : 'moveTo'](x * L, y * L));
  const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.05 * L, bevelEnabled: true, bevelThickness: 0.022 * L, bevelSize: 0.022 * L, bevelSegments: 3 }); geo.translate(0, 0, -0.025 * L);
  const out = [];
  for (let f = 0; f < n; f++) {
    const g = new THREE.Group(); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize());
    const off = 0.15 * L; add(g, new THREE.CylinderGeometry(0.08 * L, 0.09 * L, off, 20), M.dark, 0, 0, off / 2, PI / 2);
    const spin = new THREE.Group(); spin.position.z = off; spin.rotation.z = -f / n * 2 * PI / 3; g.add(spin);
    add(spin, new THREE.SphereGeometry(0.16 * L, 24, 16), M.white);
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Group(); bl.rotation.z = i * 2 * PI / 3; spin.add(bl); const tw = new THREE.Group(); tw.rotation.y = 0.2; bl.add(tw);
      add(tw, geo, M.white); add(tw, new THREE.BoxGeometry(0.42 * L, 0.012 * L, 0.1 * L), M.seam, -0.025 * L, 0.56 * L, 0);
      add(bl, new THREE.CylinderGeometry(0.06 * L, 0.07 * L, 0.12 * L, 14), M.dark, 0, 0.18 * L, 0);
    }
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-ox, w - ox, oy, -(h - oy), 1, 2000); cam.position.set(0, 0, 800); cam.lookAt(0, 0, 0);
    const sun = new THREE.DirectionalLight(0xfff4e6, key * PI); sun.position.set(-50, 60, 62);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.22 * PI); fill.position.set(300, 0, 800);
    scene.add(sun, fill, new THREE.HemisphereLight(0xd0d6f2, 0x9a9aa2, hemi * PI), g);
    renderer.setSize(w * SS, h * SS, false); renderer.render(scene, cam);
    const c = document.createElement('canvas'); c.width = w * SS; c.height = h * SS; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(renderer.domElement, 0, 0);
    out.push(x.getImageData(0, 0, c.width, c.height).data);
  }
  return { frames: out, w: w * SS, h: h * SS };
}
