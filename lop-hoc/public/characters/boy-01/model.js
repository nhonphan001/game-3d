// boy-01 — cậu bé tóc đỏ dựng đứng, tai to, mắt to, cổ gầy, áo phông có hình trái tim, quần dài, giày đỏ.
// Hợp đồng với bộ xương (rig.js): xem characters/_mau/model.js. Nhìn về +z, chân chạm y = 0.
export function createCharacter(kit) {
  const { THREE, Face, toon, part, strand, angerSprite, heartGeometry } = kit;
  const mats = {
    skin: toon(0xffeee2, {}, -0.2),
    hair: toon(0xd23a4a, { side: THREE.DoubleSide }, 0.6, 1.45),
    shirt: toon(0xffffff, { side: THREE.DoubleSide }),
    heart: toon(0xe0334a, {}, 0.8),
    pants: toon(0xdfe6f0, {}, 0.2, 1.45),
    shoe: toon(0xd23a4a, {}, 0.7),
    sole: toon(0xffffff, {}, 0.05),
  };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  // ---------- Chân: ống quần thẳng, giày đỏ ----------
  const makeLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.74, 0);
    const pant = part(new THREE.CapsuleGeometry(0.075, 0.55, 4, 12), mats.pants, 0.011);
    pant.position.y = -0.34;
    const shoe = part(new THREE.SphereGeometry(0.088, 16, 12), mats.shoe, 0.012);
    shoe.scale.set(1, 0.7, 1.6);
    shoe.position.set(0, -0.69, 0.045);
    const sole = part(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14), mats.sole, 0.006);
    sole.scale.set(1, 1, 1.9);
    sole.position.set(0, -0.725, 0.05);
    leg.add(pant, shoe, sole);
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(0.085), legR = makeLeg(-0.085);

  // ---------- Hông + thân ----------
  const hips = new THREE.Group();
  hips.position.y = 0.74;
  body.add(hips);
  const torso = new THREE.Group();
  torso.position.y = 0.03;
  hips.add(torso);
  const chest = part(new THREE.CapsuleGeometry(0.14, 0.3, 6, 16), mats.shirt);
  chest.scale.z = 0.8;
  chest.position.y = 0.24;
  torso.add(chest);
  const hem = part(new THREE.CylinderGeometry(0.15, 0.155, 0.04, 20), mats.shirt, 0.01);
  hem.scale.z = 0.8;
  hem.position.y = 0.0;
  torso.add(hem);
  const emblem = part(heartGeometry(0.06), mats.heart, 0.008);
  emblem.scale.z = 0.3;
  emblem.position.set(0.0, 0.3, 0.12);
  torso.add(emblem);

  // ---------- Tay gầy, tay áo ngắn ----------
  const makeArm = (s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.19, 0.42, 0);
    const sleeve = part(new THREE.CapsuleGeometry(0.055, 0.1, 4, 10), mats.shirt, 0.009);
    sleeve.position.y = -0.07;
    const upper = part(new THREE.CapsuleGeometry(0.037, 0.12, 4, 10), mats.skin, 0.01);
    upper.position.y = -0.17;
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    const fore = part(new THREE.CapsuleGeometry(0.034, 0.17, 4, 10), mats.skin, 0.01);
    fore.position.y = -0.1;
    const hand = part(new THREE.SphereGeometry(0.05, 12, 10), mats.skin, 0.01);
    hand.position.y = -0.24;
    elbow.add(fore, hand);
    arm.add(sleeve, upper, elbow);
    torso.add(arm);
    return { arm, elbow };
  };
  const L = makeArm(1), R = makeArm(-1);

  // ---------- Cổ + đầu ----------
  const neck = part(new THREE.CylinderGeometry(0.04, 0.045, 0.16, 12), mats.skin, 0.009);
  neck.position.y = 0.52;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);
  const HC = 0.3, HR = 0.3;
  const skull = part(new THREE.SphereGeometry(HR, 32, 24), mats.skin);
  skull.scale.set(0.92, 1.05, 0.95);
  skull.position.y = HC;
  head.add(skull);
  for (const s of [-1, 1]) { // tai to
    const ear = part(new THREE.SphereGeometry(0.11, 16, 12), mats.skin, 0.01);
    ear.scale.set(0.3, 1, 0.9);
    ear.position.set(s * 0.27, HC + 0.02, -0.01);
    ear.rotation.z = -s * 0.12;
    head.add(ear);
  }
  const face = new Face(), A = 0.9;
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(HR + 0.004, 32, 24, Math.PI / 2 - A, 2 * A, Math.PI / 2 - A, 2 * A),
    new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false }));
  faceMesh.scale.set(0.92, 1.05, 0.95);
  faceMesh.position.y = HC;
  head.add(faceMesh);

  // Tóc đỏ: chỏm hơi lệch ra sau trán + nhiều gai dựng đứng, nghiêng sang phải
  const cap = part(new THREE.SphereGeometry(HR + 0.02, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), mats.hair, 0.012);
  cap.scale.set(0.95, 1.05, 0.98);
  cap.position.set(0, HC + 0.01, -0.03);
  head.add(cap);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.22;
    const spike = part(new THREE.ConeGeometry(0.035 + rnd() * 0.02, 0.2 + rnd() * 0.12, 5), mats.hair, 0.007);
    spike.position.set(Math.sin(a) * r, HC + 0.28 - r * 0.2, Math.cos(a) * r * 0.8 - 0.05);
    spike.rotation.set(-0.15 + (rnd() - 0.5) * 0.4, 0, -0.25 + (rnd() - 0.5) * 0.4);
    head.add(spike);
  }

  const anger = angerSprite();
  anger.position.set(0.36, HC + 0.55, 0.2);
  anger.scale.setScalar(0.001);
  head.add(anger);

  return { root, body, hips, torso, head, anger, face, mats, legL, legR, armL: L.arm, elbowL: L.elbow, armR: R.arm, elbowR: R.elbow };
}
