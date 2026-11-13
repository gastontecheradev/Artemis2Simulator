import * as THREE from 'three';

/**
 * Ícono 2D propio de Orion en configuración de vuelo (referencia: 4.png), visto de
 * costado y apuntando hacia +x: cápsula cónica, adaptador, módulo de servicio,
 * paneles solares en X (se ven dos pares) y tobera. Sin logos.
 */
export function shipIconSvg(capsuleOnly: boolean): string {
  const capsule = '<path d="M 15 0 L 12.5 -2.2 L 5 -5.6 L 5 5.6 L 12.5 2.2 Z" class="hull"/>';
  if (capsuleOnly) {
    return `<svg viewBox="-20 -20 40 40" class="ship-icon">${capsule}<path d="M 5 -5.6 Q 3.2 0 5 5.6" class="shield"/></svg>`;
  }
  return `<svg viewBox="-20 -20 40 40" class="ship-icon">
    <path d="M -2 -3 L -16 -17 L -12.5 -18.5 L 1 -4 Z" class="wing"/>
    <path d="M -2 3 L -16 17 L -12.5 18.5 L 1 4 Z" class="wing"/>
    <path d="M -3 -3 L 9 -13 L 11 -10.5 L 0 -2 Z" class="wing far"/>
    <path d="M -3 3 L 9 13 L 11 10.5 L 0 2 Z" class="wing far"/>
    <path d="M -9 -2.2 L -13.5 -4 L -13.5 4 L -9 2.2 Z" class="nozzle"/>
    <rect x="-9" y="-5" width="11" height="10" class="hull"/>
    <rect x="2" y="-5.6" width="3" height="11.2" class="adapter"/>
    ${capsule}
  </svg>`;
}

export interface ShipModel {
  readonly group: THREE.Group;
  /** Después de E13 queda solo la cápsula. */
  setCapsuleOnly(on: boolean): void;
  dispose(): void;
}

/**
 * Modelo 3D procedural de Orion con primitivas (referencia: 4.png). El eje largo es +x
 * (la cápsula apunta hacia donde se orienta el grupo). Tamaño normalizado: ~1 de largo.
 */
export function createShipModel(): ShipModel {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.4 });
  const solar = new THREE.MeshStandardMaterial({ color: 0x1f2f55, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
  const disposables: { dispose(): void }[] = [white, dark, solar];
  const along = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
    geometry.rotateZ(-Math.PI / 2); // el eje y de los cilindros de Three pasa a +x
    disposables.push(geometry);
    return geometry;
  };

  // Módulo de tripulación: cono truncado.
  const capsule = new THREE.Mesh(along(new THREE.CylinderGeometry(0.05, 0.25, 0.3, 32)), white);
  capsule.position.x = 0.35;
  const shield = new THREE.Mesh(along(new THREE.CylinderGeometry(0.25, 0.22, 0.03, 32)), dark);
  shield.position.x = 0.185;

  const service = new THREE.Group();
  const adapter = new THREE.Mesh(along(new THREE.CylinderGeometry(0.25, 0.22, 0.08, 32)), dark);
  adapter.position.x = 0.14;
  const body = new THREE.Mesh(along(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 32)), white);
  body.position.x = -0.07;
  const nozzle = new THREE.Mesh(along(new THREE.CylinderGeometry(0.05, 0.12, 0.16, 24, 1, true)), dark);
  nozzle.position.x = -0.32;
  service.add(adapter, body, nozzle);
  // Cuatro paneles solares en X.
  const panelGeometry = new THREE.PlaneGeometry(0.16, 0.75);
  disposables.push(panelGeometry);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = Math.PI / 4 + (i * Math.PI) / 2;
    const panel = new THREE.Mesh(panelGeometry, solar);
    panel.position.set(-0.12, 0.6, 0);
    // Barridos hacia atrás, como en la configuración de vuelo de 4.png.
    arm.rotation.z = 0;
    panel.rotation.z = 0.25;
    arm.add(panel);
    service.add(arm);
  }
  group.add(capsule, shield, service);

  return {
    group,
    setCapsuleOnly(on) {
      service.visible = !on;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
