// MẪU mô hình 3D cho một gói nhân vật. Chép thư mục này thành characters/<id>/ rồi sửa theo bức vẽ.
// (Thư mục bắt đầu bằng "_" không hiện trong danh sách nhân vật.)
//
// Hợp đồng với bộ xương dùng chung (rig/rig.js):
//   - Nhân vật nhìn về +z, hai chân chạm y = 0.
//   - createCharacter(kit) phải trả về các khớp BẮT BUỘC:
//       root, body, hips, torso, head, armL, elbowL, armR, elbowR, legL, legR, face, mats
//     và có thể thêm phần TUỲ CHỌN (rig tự đung đưa nếu có): skirt, hairLong, bow, anger
//   - Cây khớp: root > body > (legL, legR, hips > torso > (armL > elbowL, armR > elbowR, head))
//     armL ở phía +x. Tay và chân buông dọc theo -y từ gốc khớp của nó.
//   - Vật liệu tạo bằng kit.toon(màu, tuỳ chọn, độ đậm mực 0..1, hướng nét gạch) để có cả
//     kiểu "3D bút bi" lẫn "3D tô màu"; khối tạo bằng kit.part(hình, vật liệu) để có nét viền.
//   - Khuôn mặt: new kit.Face() rồi dán face.texture lên một mảnh cầu trước mặt (xem bên dưới).
//   - createCompanion(kit) (tuỳ chọn): thú cưng / vật bay theo, tâm ở gốc toạ độ, cao khoảng 0.9.
export function createCharacter(kit) {
  const { THREE, Face, toon, part, strand, angerSprite } = kit;
  const mats = {
    skin: toon(0xffeee2, {}, -0.2),                                  // da: không gạch bóng
    hair: toon(0x5a3d2b, { side: THREE.DoubleSide }, 0.45, 1.45),    // tóc: gạch dọc khá đậm
    dress: toon(0xffffff, { side: THREE.DoubleSide }),               // áo (ô chọn màu "Váy" đổi màu này)
    pants: toon(0x3f6fd0, {}, 0.5),
    shoe: toon(0x333333, {}, 0.8),
  };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  const makeLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.62, 0);
    const thigh = part(new THREE.CapsuleGeometry(0.075, 0.42, 4, 12), mats.pants);
    thigh.position.y = -0.28;
    const shoe = part(new THREE.SphereGeometry(0.09, 14, 10), mats.shoe, 0.012);
    shoe.scale.set(1, 0.7, 1.5);
    shoe.position.set(0, -0.57, 0.04);
    leg.add(thigh, shoe);
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(0.11), legR = makeLeg(-0.11);

  const hips = new THREE.Group();
  hips.position.y = 0.62;
  body.add(hips);
  const torso = new THREE.Group();
  torso.position.y = 0.05;
  hips.add(torso);
  const chest = part(new THREE.CapsuleGeometry(0.19, 0.28, 6, 16), mats.dress);
  chest.position.y = 0.26;
  torso.add(chest);

  const makeArm = (s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.25, 0.48, 0);
    const upper = part(new THREE.CapsuleGeometry(0.05, 0.16, 4, 10), mats.dress, 0.01);
    upper.position.y = -0.12;
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    const fore = part(new THREE.CapsuleGeometry(0.045, 0.15, 4, 10), mats.skin, 0.01);
    fore.position.y = -0.1;
    const hand = part(new THREE.SphereGeometry(0.06, 12, 10), mats.skin, 0.01);
    hand.position.y = -0.24;
    elbow.add(fore, hand);
    arm.add(upper, elbow);
    torso.add(arm);
    return { arm, elbow };
  };
  const L = makeArm(1), R = makeArm(-1);

  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  const HC = 0.34; // tâm đầu so với cổ
  const skull = part(new THREE.SphereGeometry(0.36, 32, 24), mats.skin);
  skull.position.y = HC;
  head.add(skull);
  // Khuôn mặt: mảnh cầu ±0.9 rad quanh hướng +z, bán kính nhỉnh hơn đầu một chút
  const face = new Face(), A = 0.9;
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.364, 32, 24, Math.PI / 2 - A, 2 * A, Math.PI / 2 - A, 2 * A),
    new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false }));
  faceMesh.position.y = HC;
  head.add(faceMesh);
  // Tóc: chỏm trên + gáy; thêm strand([...điểm], bán kính, vật liệu) cho lọn tóc dài
  const top = part(new THREE.SphereGeometry(0.4, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), mats.hair, 0.012);
  top.position.y = HC;
  const back = part(new THREE.SphereGeometry(0.4, 28, 18, Math.PI * 0.93, Math.PI * 1.14, 0, Math.PI * 0.72), mats.hair, 0.012);
  back.position.y = HC;
  head.add(top, back);

  const anger = angerSprite();
  anger.position.set(0.36, HC + 0.5, 0.2);
  anger.scale.setScalar(0.001);
  head.add(anger);

  return { root, body, hips, torso, head, anger, face, mats, legL, legR, armL: L.arm, elbowL: L.elbow, armR: R.arm, elbowR: R.elbow };
}
