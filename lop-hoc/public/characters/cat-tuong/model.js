// cat-tuong — cô bé tóc vàng hai bím dài xoăn, băng đô hầu gái hồng có nơ, váy hồng nhiều tầng bèo,
// yếm trắng, găng tay trắng, tất trắng, giày hồng thắt nơ.
// Hợp đồng với bộ xương (rig.js): xem characters/_mau/model.js. Nhìn về +z, chân chạm y = 0.
// Tranh vẽ nhân vật đang quỳ nên phần thân dưới được dựng lại ở tư thế đứng.
export function createCharacter(kit) {
  const { THREE, Face, toon, part, strand, angerSprite, lathe } = kit;
  const mats = {
    skin: toon(0xffeee2, {}, -0.2),
    hair: toon(0xe3d83a, { side: THREE.DoubleSide }, 0.35, 1.45),
    pink: toon(0xff3d8f, { side: THREE.DoubleSide }, 0.3, 1.45),
    pinkLight: toon(0xff9ec8, { side: THREE.DoubleSide }, 0.18, 1.45),
    white: toon(0xffffff, { side: THREE.DoubleSide }),
    apron: toon(0xeef4f2, { side: THREE.DoubleSide }, 0.05),
    sock: toon(0xffffff, {}, 0.0),
    shoe: toon(0xf2a6c4, {}, 0.25),
    ribbon: toon(0xff2d7a, { side: THREE.DoubleSide }, 0.4, 0.3),
  };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  // ---------- Chân: tất trắng + giày hồng thắt nơ ----------
  const makeLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.5, 0);
    const calf = part(new THREE.CapsuleGeometry(0.058, 0.34, 4, 12), mats.sock, 0.008);
    calf.position.y = -0.24;
    const shoe = part(new THREE.SphereGeometry(0.085, 16, 12), mats.shoe, 0.011);
    shoe.scale.set(1, 0.72, 1.65);
    shoe.position.set(0, -0.455, 0.045);
    const bow = new THREE.Group();
    bow.position.set(0, -0.4, 0.06);
    for (const s of [-1, 1]) {
      const lobe = part(new THREE.SphereGeometry(0.035, 10, 8), mats.ribbon, 0.006);
      lobe.scale.set(1.3, 0.8, 0.5);
      lobe.position.x = s * 0.035;
      bow.add(lobe);
    }
    leg.add(calf, shoe, bow);
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(0.095), legR = makeLeg(-0.095);

  // ---------- Hông + váy nhiều tầng bèo ----------
  const hips = new THREE.Group();
  hips.position.y = 0.5;
  body.add(hips);
  const skirt = new THREE.Group();
  skirt.position.y = 0.3;
  hips.add(skirt);
  skirt.add(part(lathe([[0.12, 0.0], [0.2, -0.05], [0.34, -0.2], [0.44, -0.3]]), mats.pink, 0.012));
  skirt.add(part(lathe([[0.2, -0.1], [0.38, -0.25], [0.5, -0.34], [0.55, -0.38]]), mats.pinkLight, 0.012));
  const ring = (count, rad, y, size, mat) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const f = part(new THREE.SphereGeometry(size, 10, 8), mat, 0.008);
      f.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      f.scale.y = 0.7;
      skirt.add(f);
    }
  };
  ring(24, 0.43, -0.3, 0.05, mats.pink);
  ring(26, 0.545, -0.375, 0.055, mats.pinkLight);
  ring(28, 0.52, -0.4, 0.045, mats.white);

  // ---------- Thân: áo + yếm trắng + nơ cổ ----------
  const torso = new THREE.Group();
  torso.position.y = 0.3;
  hips.add(torso);
  const chest = part(new THREE.CapsuleGeometry(0.13, 0.22, 6, 16), mats.white);
  chest.scale.z = 0.8;
  chest.position.y = 0.2;
  const apron = part(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 20, 1, true, -1.1, 2.2), mats.apron, 0.01);
  apron.position.set(0, 0.09, 0.0);
  apron.scale.z = 0.85;
  const bib = part(new THREE.BoxGeometry(0.17, 0.2, 0.012), mats.apron, 0.008);
  bib.position.set(0, 0.24, 0.115);
  torso.add(chest, apron, bib);
  for (const s of [-1, 1]) { // dây yếm
    const strap = part(new THREE.BoxGeometry(0.025, 0.2, 0.01), mats.apron, 0.006);
    strap.position.set(s * 0.065, 0.31, 0.1);
    strap.rotation.z = -s * 0.15;
    torso.add(strap);
  }
  for (const y of [0.22, 0.14]) { // hai khuy hồng
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), mats.ribbon);
    btn.position.set(0.06, y, 0.12);
    torso.add(btn);
  }
  const collar = part(new THREE.TorusGeometry(0.09, 0.02, 8, 20), mats.white, 0.008);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.37;
  torso.add(collar);
  const tie = new THREE.Group();
  tie.position.set(0, 0.33, 0.1);
  for (const s of [-1, 1]) {
    const lobe = part(new THREE.SphereGeometry(0.045, 12, 10), mats.ribbon, 0.007);
    lobe.scale.set(1.3, 0.8, 0.4);
    lobe.position.x = s * 0.05;
    lobe.rotation.z = s * 0.3;
    const tail = part(new THREE.BoxGeometry(0.03, 0.1, 0.008), mats.ribbon, 0.005);
    tail.geometry.translate(0, -0.05, 0);
    tail.position.set(s * 0.02, -0.02, 0);
    tail.rotation.z = s * 0.2;
    tie.add(lobe, tail);
  }
  tie.add(part(new THREE.SphereGeometry(0.02, 8, 8), mats.ribbon, 0.005));
  torso.add(tie);

  // ---------- Tay: tay bồng hồng viền bèo + găng trắng ----------
  const makeArm = (s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.18, 0.34, 0);
    const puff = part(new THREE.SphereGeometry(0.095, 14, 12), mats.pink, 0.011);
    puff.position.y = -0.04;
    const frill = part(new THREE.TorusGeometry(0.06, 0.025, 8, 14), mats.pinkLight, 0.008);
    frill.rotation.x = Math.PI / 2;
    frill.position.y = -0.11;
    const upper = part(new THREE.CapsuleGeometry(0.036, 0.12, 4, 10), mats.skin, 0.01);
    upper.position.y = -0.17;
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    const glove = part(new THREE.CapsuleGeometry(0.038, 0.14, 4, 10), mats.white, 0.01);
    glove.position.y = -0.09;
    const cuff = part(new THREE.TorusGeometry(0.045, 0.02, 8, 12), mats.pinkLight, 0.007);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.02;
    const hand = part(new THREE.SphereGeometry(0.05, 12, 10), mats.white, 0.01);
    hand.position.y = -0.22;
    elbow.add(glove, cuff, hand);
    arm.add(puff, frill, upper, elbow);
    torso.add(arm);
    return { arm, elbow };
  };
  const L = makeArm(1), R = makeArm(-1);

  // ---------- Đầu ----------
  const head = new THREE.Group();
  head.position.y = 0.4;
  torso.add(head);
  const HC = 0.32, HR = 0.31;
  const skull = part(new THREE.SphereGeometry(HR, 32, 24), mats.skin);
  skull.position.y = HC;
  head.add(skull);
  const face = new Face(), A = 0.9;
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(HR + 0.004, 32, 24, Math.PI / 2 - A, 2 * A, Math.PI / 2 - A, 2 * A),
    new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false }));
  faceMesh.position.y = HC;
  head.add(faceMesh);

  // Tóc vàng: chỏm + ót + mái xoè hai bên + sợi tóc dựng
  const hairTop = part(new THREE.SphereGeometry(HR + 0.035, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.44), mats.hair, 0.012);
  hairTop.position.y = HC;
  const hairBack = part(new THREE.SphereGeometry(HR + 0.035, 28, 18, Math.PI * 0.93, Math.PI * 1.14, 0, Math.PI * 0.78), mats.hair, 0.012);
  hairBack.position.y = HC;
  head.add(hairTop, hairBack);
  for (const s of [-1, 1]) { // mái chia hai bên, tóc mai hai bên má
    head.add(strand([[s * 0.02, HC + 0.33, 0.2], [s * 0.12, HC + 0.27, 0.27], [s * 0.23, HC + 0.12, 0.26], [s * 0.3, HC - 0.04, 0.14]], 0.055, mats.hair, 0.01));
    head.add(strand([[s * 0.3, HC + 0.05, 0.12], [s * 0.34, HC - 0.1, 0.12], [s * 0.33, HC - 0.26, 0.1], [s * 0.3, HC - 0.36, 0.1]], 0.04, mats.hair, 0.01));
  }
  const ahoge = strand([[-0.12, HC + 0.34, 0.05], [-0.2, HC + 0.46, 0.04], [-0.28, HC + 0.43, 0.04]], 0.018, mats.hair, 0.006);
  head.add(ahoge);

  // Hai bím tóc dài xoăn ở cuối (nằm trong hairLong để tự đung đưa)
  const hairLong = new THREE.Group();
  hairLong.position.y = HC;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const f = k / 8;
      pts.push([s * (0.36 + f * 0.1 + Math.sin(f * 5) * 0.03), 0.08 - f * 1.15, -0.05 - f * 0.04]);
    }
    hairLong.add(strand(pts, 0.1, mats.hair, 0.012));
    const curl = [];
    for (let k = 0; k <= 12; k++) { // đuôi xoăn
      const a = k * 0.75, r = 0.13 - k * 0.006;
      curl.push([s * (0.46 + Math.cos(a) * r), -1.07 + Math.sin(a) * r * 0.8, -0.09 + Math.sin(a) * 0.02]);
    }
    hairLong.add(strand(curl, 0.06, mats.hair, 0.01));
    hairLong.add(strand([[s * 0.34, 0.0, 0.0], [s * 0.4, -0.4, 0.02], [s * 0.45, -0.85, 0.0]], 0.06, mats.hair, 0.01));
    const tie = part(new THREE.SphereGeometry(0.07, 12, 10), mats.pinkLight, 0.008); // thun buộc tóc hồng
    tie.position.set(s * 0.34, 0.0, 0.0);
    hairLong.add(tie);
  }
  head.add(hairLong);

  // Băng đô hầu gái hồng có bèo + hai nơ tai mèo
  const bow = new THREE.Group();
  bow.position.set(0, HC + 0.3, 0.02);
  const band = part(new THREE.TorusGeometry(0.3, 0.035, 8, 40, Math.PI), mats.pinkLight, 0.01);
  band.rotation.set(0, Math.PI / 2, Math.PI / 2);
  band.rotation.order = 'YXZ';
  band.position.set(0, -0.1, -0.05);
  const frillBand = part(new THREE.SphereGeometry(0.19, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), mats.pink, 0.01);
  frillBand.scale.set(1, 0.7, 0.8);
  frillBand.position.set(0, -0.04, 0.03);
  bow.add(frillBand);
  for (const s of [-1, 1]) {
    const lobe = part(new THREE.SphereGeometry(0.1, 14, 10), mats.pink, 0.011);
    lobe.scale.set(1, 0.9, 0.35);
    lobe.position.set(s * 0.17, 0.0, 0.0);
    lobe.rotation.z = -s * 0.4;
    bow.add(lobe);
  }
  const knot = part(new THREE.SphereGeometry(0.04, 10, 8), mats.pinkLight, 0.007);
  knot.position.set(-0.2, -0.04, 0.12);
  bow.add(knot);
  const rose = part(new THREE.SphereGeometry(0.075, 12, 10), mats.ribbon, 0.01); // hoa hồng bên trái
  rose.position.set(-0.28, HC * 0 - 0.12, 0.12);
  bow.add(rose);
  head.add(bow);

  const anger = angerSprite();
  anger.position.set(0.42, HC + 0.6, 0.2);
  anger.scale.setScalar(0.001);
  head.add(anger);

  return {
    root, body, hips, skirt, torso, head, hairLong, bow, anger, face, mats,
    legL, legR, armL: L.arm, elbowL: L.elbow, armR: R.arm, elbowR: R.elbow,
  };
}
