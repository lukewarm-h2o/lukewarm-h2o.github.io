// Live "build chamber" hero: a bucket of procedural parts you can drag around.
// Falls back to the static drawing for reduced motion, no WebGL, or if the libraries fail to load.
const host = document.getElementById('bucket-hero');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function useStatic() { if (host) host.classList.add('is-static'); }

async function start() {
    if (!host) return;
    const canvasTest = document.createElement('canvas');
    if (reduceMotion || !(canvasTest.getContext('webgl2') || canvasTest.getContext('webgl'))) return useStatic();

    const [THREE, CANNON] = await Promise.all([import('three'), import('cannon')]);

    const ACCENT = 0xff5a2b, INK = 0xece9e4, FILL = 0x1b1c1e;
    const W = 170, D = 170, H = 150, T = 20; // bucket inner width, depth, height, wall thickness

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 10, 3000);
    // Fit the whole bucket in view, as close as possible without clipping, whatever the canvas shape.
    const viewDir = new THREE.Vector3(330, 300, 380).normalize();
    const viewCenter = new THREE.Vector3(0, H * 0.5 - 17, 0); // aim slightly low so the bucket sits centred
    const corners = [];
    for (const x of [-W / 2, W / 2]) for (const y of [0, H]) for (const z of [-D / 2, D / 2]) corners.push(new THREE.Vector3(x, y, z));
    const probe = new THREE.Vector3();
    function extentAt(distance) {
        camera.position.copy(viewCenter).addScaledVector(viewDir, distance);
        camera.lookAt(viewCenter);
        camera.updateMatrixWorld();
        let widest = 0;
        for (const corner of corners) {
            probe.copy(corner).project(camera);
            widest = Math.max(widest, Math.abs(probe.x), Math.abs(probe.y));
        }
        return widest;
    }
    function fitCamera() {
        camera.updateProjectionMatrix();
        let near = 50, far = 3000;
        for (let i = 0; i < 28; i++) {
            const mid = (near + far) / 2;
            if (extentAt(mid) > 0.97) near = mid; else far = mid;
        }
        extentAt(far);
    }
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(200, 400, 150);
    scene.add(sun);

    // Bucket: frame edges, floor, and the two back walls as faint panes.
    const bucketFrame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
        new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 }));
    bucketFrame.position.y = H / 2;
    scene.add(bucketFrame);
    const paneMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.07, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paneMat);
    back.position.set(0, H / 2, -D / 2);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), paneMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, H / 2, 0);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: 0x151618 }));
    floor.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(W, 8, INK, INK);
    grid.position.y = 0.5;
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    scene.add(back, left, floor, grid);

    // Physics world
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -600, 0) });
    world.allowSleep = true;
    const wallMat = new CANNON.Material('wall');
    const partMat = new CANNON.Material('part');
    world.addContactMaterial(new CANNON.ContactMaterial(wallMat, partMat, { friction: 0.35, restitution: 0.2 }));
    world.addContactMaterial(new CANNON.ContactMaterial(partMat, partMat, { friction: 0.4, restitution: 0.15 }));
    function wall(x, y, z, sx, sy, sz) {
        const b = new CANNON.Body({ mass: 0, material: wallMat });
        b.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
        b.position.set(x, y, z);
        world.addBody(b);
    }
    wall(0, -T / 2, 0, W + 2 * T, T, D + 2 * T);
    wall(0, H / 2, -D / 2 - T / 2, W + 2 * T, H * 3, T);
    wall(0, H / 2, D / 2 + T / 2, W + 2 * T, H * 3, T);
    wall(-W / 2 - T / 2, H / 2, 0, T, H * 3, D + 2 * T);
    wall(W / 2 + T / 2, H / 2, 0, T, H * 3, D + 2 * T);

    // Procedural parts (boxes, spheres and an L-bracket) with technical edge lines.
    const parts = [];
    const pickables = [];
    function material(accent) { return new THREE.MeshLambertMaterial({ color: accent ? ACCENT : FILL, flatShading: true }); }
    function addEdges(mesh, accent) {
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20),
            new THREE.LineBasicMaterial({ color: accent ? 0x0e0f10 : INK, transparent: true, opacity: accent ? 0.7 : 0.85 })));
    }
    function makePart(spec) {
        const group = new THREE.Group();
        const body = new CANNON.Body({ mass: 1, material: partMat, allowSleep: true, sleepSpeedLimit: 8, sleepTimeLimit: 0.6,
            linearDamping: 0.05, angularDamping: 0.15 });
        const boxes = spec.type === 'L'
            ? [{ s: [spec.a, spec.b, spec.b], p: [0, 0, 0] }, { s: [spec.b, spec.a * 0.7, spec.b], p: [-(spec.a - spec.b) / 2, spec.a * 0.35 + spec.b / 2, 0] }]
            : spec.type === 'box' ? [{ s: spec.size, p: [0, 0, 0] }] : [];
        for (const { s, p } of boxes) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s), material(spec.accent));
            mesh.position.set(...p);
            addEdges(mesh, spec.accent);
            group.add(mesh);
            pickables.push(mesh);
            mesh.userData.part = group;
            body.addShape(new CANNON.Box(new CANNON.Vec3(s[0] / 2, s[1] / 2, s[2] / 2)), new CANNON.Vec3(...p));
        }
        if (spec.type === 'sphere') {
            const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(spec.r, 1), material(spec.accent));
            addEdges(mesh, spec.accent);
            group.add(mesh);
            pickables.push(mesh);
            mesh.userData.part = group;
            body.addShape(new CANNON.Sphere(spec.r * 0.95));
        }
        body.position.set((Math.random() - 0.5) * (W - 90), H + 30 + Math.random() * 50, (Math.random() - 0.5) * (D - 90));
        body.quaternion.setFromEuler(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        body.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        world.addBody(body);
        scene.add(group);
        const part = { group, body };
        group.userData.partRef = part;
        parts.push(part);
    }
    const specs = [
        { type: 'box', size: [48, 48, 48] },
        { type: 'box', size: [64, 26, 38], accent: true },
        { type: 'sphere', r: 24 },
        { type: 'L', a: 62, b: 22 },
        { type: 'box', size: [30, 56, 30] },
        { type: 'sphere', r: 18, accent: true },
        { type: 'box', size: [56, 20, 56] },
        { type: 'L', a: 50, b: 18, accent: true },
        { type: 'box', size: [34, 34, 34] },
    ];
    specs.forEach((spec, i) => setTimeout(() => makePart(spec), 300 + i * 420));

    // Dragging: pull a part toward the pointer on a camera-facing plane.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragged = null, dragPlane = null, dragTarget = new THREE.Vector3(), grabOffset = new THREE.Vector3();
    function setPointer(e) {
        const r = host.getBoundingClientRect();
        pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
    }
    renderer.domElement.addEventListener('pointerdown', e => {
        setPointer(e);
        const hit = raycaster.intersectObjects(pickables, false)[0];
        if (!hit) return;
        dragged = hit.object.userData.part.userData.partRef;
        dragged.body.wakeUp();
        dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), hit.point);
        grabOffset.copy(hit.point).sub(new THREE.Vector3().copy(dragged.body.position));
        dragTarget.copy(hit.point);
        renderer.domElement.setPointerCapture(e.pointerId);
        host.classList.add('is-grabbing');
        e.preventDefault();
    });
    renderer.domElement.addEventListener('pointermove', e => {
        if (!dragged) return;
        setPointer(e);
        raycaster.ray.intersectPlane(dragPlane, dragTarget);
    });
    function release() { dragged = null; host.classList.remove('is-grabbing'); }
    renderer.domElement.addEventListener('pointerup', release);
    renderer.domElement.addEventListener('pointercancel', release);

    function resize() {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        fitCamera();
        renderer.setSize(w, h, false);
    }
    new ResizeObserver(resize).observe(host);
    resize();
    host.classList.add('is-live');

    // Run only while visible.
    let running = false, visible = true, last = performance.now();
    function frame(now) {
        if (!running) return;
        requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 1 / 20);
        last = now;
        if (dragged) {
            const target = dragTarget.clone().sub(grabOffset);
            target.x = Math.max(-W / 2 + 30, Math.min(W / 2 - 30, target.x));
            target.z = Math.max(-D / 2 + 30, Math.min(D / 2 - 30, target.z));
            target.y = Math.max(25, Math.min(H + 40, target.y));
            const b = dragged.body;
            b.velocity.set((target.x - b.position.x) * 14, (target.y - b.position.y) * 14, (target.z - b.position.z) * 14);
            b.angularVelocity.scale(0.9, b.angularVelocity);
            b.wakeUp();
        }
        world.step(1 / 60, dt, 3);
        for (const { group, body } of parts) {
            group.position.copy(body.position);
            group.quaternion.copy(body.quaternion);
        }
        renderer.render(scene, camera);
    }
    function sync() {
        const should = visible && !document.hidden;
        if (should && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
        else if (!should) running = false;
    }
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }).observe(host);
    document.addEventListener('visibilitychange', sync);
    sync();
}

start().catch(() => useStatic());
