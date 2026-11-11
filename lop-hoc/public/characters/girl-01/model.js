// girl-01 — cô bé tóc dài, áo cổ thủy thủ thắt nơ, váy xếp li dài, tay áo dài.
// Hợp đồng với bộ xương (rig.js): xem characters/_mau/model.js. Nhìn về +z, chân chạm y = 0.
// Phần thân dưới (chân, tay, bàn tay) bức vẽ bị cắt nên được dựng bổ sung.
export function createCharacter(kit) {
  const { THREE, Face, toon, part, strand, angerSprite, lathe } = kit;
  const mats = {
    skin: toon(0xffeee2, {}, -0.2),
    hair: toon(0x3a2a24, { side: THREE.DoubleSide }, 0.5, 1.45),
    dress: toon(0xffffff, { side: THREE.DoubleSide }),
    skirt: toon(0xffffff, { side: THREE.DoubleSide }, 0.18, 1.45),
    ribbon: toon(0xffffff, { side: THREE.DoubleSide }, 0.25),
    sock: toon(0xffffff, {}, 0.05),
    shoe: toon(0x6b4a3a, {}, 0.7),
  };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  // ---------- Chân (che dưới váy) ----------
  const makeLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.5, 0);
    const calf = part(new THREE.CapsuleGeometry(0.052, 0.36, 4, 12), mats.skin, 0.01);
    calf.position.y = -0.27;
    const sock = part(new THREE.CylinderGeometry(0.056, 0.05, 0.16, 14), mats.sock, 0.009);
    sock.position.y = -0.4;
    const shoe = part(new THREE.SphereGeometry(0.075, 16, 12), mats.shoe, 0.012);
    shoe.scale.set(1, 0.7, 1.7);
    shoe.position.set(0, -0.47, 0.045);
    leg.add(calf, sock, shoe);
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(0.09), legR = makeLeg(-0.09);

  // ---------- Hông + váy xếp li ----------
  const hips = new THREE.Group();
  hips.position.y = 0.55;
  body.add(hips);
  const skirt = new THREE.Group();
  skirt.position.y = 0.4;
  hips.add(skirt);
  skirt.add(part(lathe([[0.14, 0.0], [0.2, -0.05], [0.3, -0.3], [0.4, -0.55]]), mats.skirt, 0.012));
  for (let i = 0; i < 14; i++) { // nếp xếp li
    const a = (i / 14) * Math.PI * 2;
    skirt.add(strand([[Math.sin(a) * 0.2, -0.07, Math.cos(a) * 0.2], [Math.sin(a) * 0.3, -0.3, Math.cos(a) * 0.3], [Math.sin(a) * 0.4, -0.55, Math.cos(a) * 0.4]], 0.006, mats.skirt, 0.004));
  }

  // ---------- Thân: áo dài tay, cổ thủy thủ, nơ ----------
  const torso = new THREE.Group();
  torso.position.y = 0.4;
  hips.add(torso);
  const waist = part(new THREE.TorusGeometry(0.135, 0.022, 8, 24), mats.dress, 0.008); // chun eo
  waist.rotation.x = Math.PI / 2;
  const chest = part(new THREE.CapsuleGeometry(0.15, 0.2, 6, 18), mats.dress);
  chest.scale.z = 0.8;
  chest.position.y = 0.17;
  torso.add(waist, chest);
  const collar = part(new THREE.SphereGeometry(0.2, 28, 10, 0, Math.PI * 2, 0.55, 0.55), mats.dress, 0.01);
  collar.scale.set(1.15, 0.7, 1.05);
  collar.position.y = 0.34;
  torso.add(collar);
  const bowTie = new THREE.Group();
  bowTie.position.set(0, 0.27, 0.15);
  for (const s of [-1, 1]) {
    const lobe = part(new THREE.SphereGeometry(0.05, 12, 10), mats.ribbon, 0.008);
    lobe.scale.set(1.2, 0.8, 0.4);
    lobe.position.set(s * 0.05, 0, 0);
    lobe.rotation.z = s * 0.3;
    const tail = part(new THREE.BoxGeometry(0.035, 0.12, 0.01), mats.ribbon, 0.006);
    tail.geometry.translate(0, -0.06, 0);
    tail.position.set(s * 0.02, -0.02, 0);
    tail.rotation.z = s * 0.2;
    bowTie.add(lobe, tail);
  }
  bowTie.add(part(new THREE.SphereGeometry(0.022, 10, 8), mats.ribbon, 0.006));
  torso.add(bowTie);

  // ---------- Tay áo dài + bàn tay ----------
  const makeArm = (s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.19, 0.34, 0);
    const upper = part(new THREE.CapsuleGeometry(0.052, 0.18, 4, 10), mats.dress, 0.01);
    upper.position.y = -0.12;
    const elbow = new THREE.Group();
    elbow.position.y = -0.25;
    const fore = part(new THREE.CapsuleGeometry(0.05, 0.17, 4, 10), mats.dress, 0.01);
    fore.position.y = -0.11;
    const cuff = part(new THREE.CylinderGeometry(0.058, 0.052, 0.04, 12), mats.dress, 0.008);
    cuff.position.y = -0.23;
    const hand = part(new THREE.SphereGeometry(0.048, 12, 10), mats.skin, 0.01);
    hand.scale.set(0.9, 1.2, 0.75);
    hand.position.y = -0.29;
    elbow.add(fore, cuff, hand);
    arm.add(upper, elbow);
    torso.add(arm);
    return { arm, elbow };
  };
  const L = makeArm(1), R = makeArm(-1);

  // ---------- Đầu ----------
  const head = new THREE.Group();
  head.position.y = 0.42;
  torso.add(head);
  const HC = 0.29, HR = 0.29;
  const skull = part(new THREE.SphereGeometry(HR, 32, 24), mats.skin);
  skull.position.y = HC;
  head.add(skull);
  const face = new Face(), A = 0.9;
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(HR + 0.004, 32, 24, Math.PI / 2 - A, 2 * A, Math.PI / 2 - A, 2 * A),
    new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false }));
  faceMesh.position.y = HC;
  head.add(faceMesh);

  // Tóc: chỏm + ót + mái rẽ giữa + chỏm tóc dựng trên đỉnh
  const hairTop = part(new THREE.SphereGeometry(HR + 0.035, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.43), mats.hair, 0.012);
  hairTop.position.y = HC;
  const hairBack = part(new THREE.SphereGeometry(HR + 0.035, 28, 18, Math.PI * 0.93, Math.PI * 1.14, 0, Math.PI * 0.78), mats.hair, 0.012);
  hairBack.position.y = HC;
  head.add(hairTop, hairBack);
  for (const s of [-1, 1]) { // mái chia hai bên trán
    head.add(strand([[s * 0.02, HC + 0.3, 0.2], [s * 0.1, HC + 0.24, 0.26], [s * 0.2, HC + 0.12, 0.25], [s * 0.285, HC - 0.04, 0.12]], 0.05, mats.hair, 0.01));
    head.add(strand([[s * 0.04, HC + 0.3, 0.17], [s * 0.15, HC + 0.26, 0.2], [s * 0.26, HC + 0.12, 0.17], [s * 0.31, HC - 0.1, 0.1]], 0.04, mats.hair, 0.01));
  }
  const tuft = part(new THREE.ConeGeometry(0.03, 0.12, 6), mats.hair, 0.008);
  tuft.position.set(0, HC + HR + 0.07, 0.07);
  tuft.rotation.x = 0.4;
  head.add(tuft);

  const hairLong = new THREE.Group();
  hairLong.position.y = HC;
  const backFill = part(new THREE.CapsuleGeometry(0.29, 0.75, 8, 20), mats.hair, 0.014);
  backFill.scale.z = 0.4;
  backFill.position.set(0, -0.45, -0.17);
  hairLong.add(backFill);
  [[-0.3, -0.1, 0.95, 0], [-0.22, -0.2, 1.0, 1], [-0.08, -0.25, 0.92, 2], [0.08, -0.25, 0.92, 3], [0.22, -0.2, 1.0, 4], [0.3, -0.1, 0.95, 5]].forEach(([x, z, len, seed]) => {
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const f = k / 5;
      pts.push([x * (1 + f * 0.25) + Math.sin(k * 1.4 + seed) * 0.03, 0.05 - f * len, z + Math.cos(k * 1.2 + seed) * 0.02]);
    }
    hairLong.add(strand(pts, 0.065, mats.hair, 0.01));
  });
  head.add(hairLong);
  for (const s of [-1, 1]) { // tóc mai dài buông trước vai
    head.add(strand([[s * 0.29, HC - 0.02, 0.1], [s * 0.31, HC - 0.2, 0.1], [s * 0.29, HC - 0.4, 0.1], [s * 0.3, HC - 0.62, 0.11], [s * 0.32, HC - 0.8, 0.1]], 0.045, mats.hair, 0.01));
    head.add(strand([[s * 0.31, HC - 0.06, 0.04], [s * 0.35, HC - 0.3, 0.05], [s * 0.34, HC - 0.58, 0.05], [s * 0.37, HC - 0.84, 0.04]], 0.04, mats.hair, 0.01));
  }

  const anger = angerSprite();
  anger.position.set(0.34, HC + 0.5, 0.2);
  anger.scale.setScalar(0.001);
  head.add(anger);

  return { root, body, hips, skirt, torso, head, hairLong, anger, face, mats, legL, legR, armL: L.arm, elbowL: L.elbow, armR: R.arm, elbowR: R.elbow };
}
