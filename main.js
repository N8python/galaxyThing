import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.155.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.155.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.155.0/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'https://unpkg.com/three@0.155.0/examples/jsm/postprocessing/SMAAPass.js';
import { GammaCorrectionShader } from 'https://unpkg.com/three@0.155.0/examples/jsm/shaders/GammaCorrectionShader.js';
import { EffectShader } from "./EffectShader.js";
import { OrbitControls } from 'https://unpkg.com/three@0.155.0/examples/jsm/controls/OrbitControls.js';
import { AssetManager } from './AssetManager.js';
import { GUI } from "https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js";
import { Stats } from "./stats.js";
import { LUTPass } from "https://unpkg.com/three@0.155.0/examples/jsm/postprocessing/LUTPass.js";
import { FullScreenQuad } from "https://unpkg.com/three@0.155.0/examples/jsm/postprocessing/Pass.js";

function clientWaitAsync(gl, sync, flags, interval_ms) {
    return new Promise((resolve, reject) => {
        function test() {
            const res = gl.clientWaitSync(sync, flags, 0);
            if (res === gl.WAIT_FAILED) {
                reject();
                return;
            }
            if (res === gl.TIMEOUT_EXPIRED) {
                setTimeout(test, interval_ms);
                return;
            }
            resolve();
        }
        test();
    });
}

async function getBufferSubDataAsync(
    gl,
    target,
    buffer,
    srcByteOffset,
    dstBuffer,
    /* optional */
    dstOffset,
    /* optional */
    length,
) {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();

    await clientWaitAsync(gl, sync, 0, 10);
    gl.deleteSync(sync);

    gl.bindBuffer(target, buffer);
    gl.getBufferSubData(target, srcByteOffset, dstBuffer, dstOffset, length);
    gl.bindBuffer(target, null);

    return dstBuffer;
}

async function readPixelsAsync(gl, x, y, w, h, format, type, dest) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, dest.byteLength, gl.STREAM_READ);
    gl.readPixels(x, y, w, h, format, type, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    await getBufferSubDataAsync(gl, gl.PIXEL_PACK_BUFFER, buf, 0, dest);

    gl.deleteBuffer(buf);
    return dest;
}
async function main() {
    // Setup basic renderer, controls, and profiler
    const clientWidth = window.innerWidth;
    const clientHeight = window.innerHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    camera.position.set(50, 75, 50);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(clientWidth, clientHeight);
    document.body.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);
    const defaultTexture = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.FloatType,

    });
    defaultTexture.depthTexture = new THREE.DepthTexture(clientWidth, clientHeight, THREE.FloatType);
    const loadImage = (url) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    };
    const milkyWayTexture = (await loadImage("milkyway.jpeg"));
    // Draw milkyWayTexture on canvas
    const canvas = document.createElement("canvas");
    canvas.width = milkyWayTexture.width;
    canvas.height = milkyWayTexture.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(milkyWayTexture, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    // Convert data into colors
    const MILKYWAY = new Float32Array(canvas.width * canvas.height * 4);
    for (let i = 0; i < data.length; i += 4) {
        MILKYWAY[i + 0] = data[i + 0] / 255;
        MILKYWAY[i + 1] = data[i + 1] / 255;
        MILKYWAY[i + 2] = data[i + 2] / 255;
        MILKYWAY[i + 3] = data[i + 3] / 255;
    }
    const MILKYWAY_LUMINANCE = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < MILKYWAY_LUMINANCE.length; i++) {
        const r = MILKYWAY[i * 4 + 0];
        const g = MILKYWAY[i * 4 + 1];
        const b = MILKYWAY[i * 4 + 2];
        MILKYWAY_LUMINANCE[i] = Math.max(r, g, b) ** 3;
    }
    let MILKYWAY_LUMINANCE_SUM = 0;
    for (let i = 0; i < MILKYWAY_LUMINANCE.length; i++) {
        MILKYWAY_LUMINANCE_SUM += MILKYWAY_LUMINANCE[i];
    }
    const MILKYWAY_PREFIX_SUM = new Float32Array(canvas.width * canvas.height);
    let sum = 0;
    for (let i = 0; i < MILKYWAY_LUMINANCE.length; i++) {
        sum += MILKYWAY_LUMINANCE[i];
        MILKYWAY_PREFIX_SUM[i] = sum;
    }



    const particleGeometry = new THREE.InstancedBufferGeometry();
    particleGeometry.copy(new THREE.PlaneGeometry(1, 1));
    const COUNT = 1e6;
    const sqrtCount = Math.ceil(Math.sqrt(COUNT));
    const TOTAL_SIZE = sqrtCount * sqrtCount;
    const particlePositions = new Float32Array(new SharedArrayBuffer(TOTAL_SIZE * 16), 0, TOTAL_SIZE * 4);
    const particleColors = new Float32Array(TOTAL_SIZE * 4);
    const particleIds = new Float32Array(new SharedArrayBuffer(COUNT * 4), 0, COUNT);
    for (let i = 0; i < COUNT; i++) {
        particleIds[i] = i;
        const threshold = Math.random() * MILKYWAY_LUMINANCE_SUM;
        // Binary search for threshold
        let left = 0;
        let right = MILKYWAY_PREFIX_SUM.length - 1;
        let mid = Math.floor((left + right) / 2);
        while (left < right) {
            if (MILKYWAY_PREFIX_SUM[mid] > threshold) {
                right = mid;
            } else {
                left = mid + 1;
            }
            mid = Math.floor((left + right) / 2);
        }
        const y = Math.floor(mid / canvas.width);
        const x = mid % canvas.width;
        const i4 = i * 4;
        const i3 = i * 3;
        const SIZE = 500;
        if (i < COUNT / 2) {
            particlePositions[i4 + 0] = (x / canvas.width - 0.5) * SIZE + Math.random() * 1 - 0.5;
            particlePositions[i4 + 1] = Math.random() - 0.5;
            particlePositions[i4 + 2] = (y / canvas.height - 0.5) * SIZE + Math.random() * 1 - 0.5;
            const r = MILKYWAY[y * canvas.width * 4 + x * 4 + 0];
            const g = MILKYWAY[y * canvas.width * 4 + x * 4 + 1];
            const b = MILKYWAY[y * canvas.width * 4 + x * 4 + 2];
            const a = Math.max(r, g, b) * 0.1;
            particlePositions[i4 + 3] = 2 + 10 * Math.random() ** 10;
            particleColors[i4 + 0] = r;
            particleColors[i4 + 1] = g;
            particleColors[i4 + 2] = b;
            particleColors[i4 + 3] = a; //a;
        } else {
            particlePositions[i4 + 0] = (x / canvas.width - 0.5) * SIZE + Math.random() * 1 - 0.5;
            particlePositions[i4 + 1] = Math.random() - 0.5;
            particlePositions[i4 + 2] = (y / canvas.height - 0.5) * SIZE + Math.random() * 1 - 0.5;
            particlePositions[i4 + 3] = 0.05 + 0.05 * Math.random() + 0.6 * Math.random() ** 10;
            const size = particlePositions[i4 + 3];
            // Color based off of size - max size is 0.7
            if (size < 0.075) { // M-dwarf
                particleColors[i4 + 0] = 1.5;
                particleColors[i4 + 1] = 1;
                particleColors[i4 + 2] = 1;
                particleColors[i4 + 3] = 1;
            } else if (size < 0.125) { // K-dwarf
                particleColors[i4 + 0] = 2;
                particleColors[i4 + 1] = 1.7;
                particleColors[i4 + 2] = 1.1;
                particleColors[i4 + 3] = 1;
            } else if (size < 0.2) { // G-type
                particleColors[i4 + 0] = 2.3;
                particleColors[i4 + 1] = 1.7;
                particleColors[i4 + 2] = 1.2;
                particleColors[i4 + 3] = 1;
            } else if (size < 0.35) { // F-type
                particleColors[i4 + 0] = 2.5;
                particleColors[i4 + 1] = 2.5;
                particleColors[i4 + 2] = 2.0;
                particleColors[i4 + 3] = 1;
            } else if (size < 0.5) { // A-type
                particleColors[i4 + 0] = 2.5;
                particleColors[i4 + 1] = 2.5;
                particleColors[i4 + 2] = 2.5;
                particleColors[i4 + 3] = 1;
            } else if (size < 0.625) { // B-type
                particleColors[i4 + 0] = 2.5;
                particleColors[i4 + 1] = 2.5;
                particleColors[i4 + 2] = 3.0;
                particleColors[i4 + 3] = 1;
            } else { // O-Type
                particleColors[i4 + 0] = 2.5;
                particleColors[i4 + 1] = 2.5;
                particleColors[i4 + 2] = 4.0;
                particleColors[i4 + 3] = 1;
            }
            // Add variation to color
            const variation = 0.5;
            const varRand = Math.random();
            particleColors[i4 + 0] *= 1 + variation * (varRand - 0.5);
            particleColors[i4 + 1] *= 1 + variation * (varRand - 0.5);
            particleColors[i4 + 2] *= 1 + variation * (varRand - 0.5);


        }
    }

    // Make textures
    const particlePositionTexture = new THREE.DataTexture(particlePositions, sqrtCount, sqrtCount, THREE.RGBAFormat, THREE.FloatType);
    const particleColorTexture = new THREE.DataTexture(particleColors, sqrtCount, sqrtCount, THREE.RGBAFormat, THREE.FloatType);
    particlePositionTexture.needsUpdate = true;
    particleColorTexture.needsUpdate = true;
    const positionRenderTarget = new THREE.WebGLRenderTarget(sqrtCount, sqrtCount, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.FloatType,
    });
    const positionRenderTarget2 = new THREE.WebGLRenderTarget(sqrtCount, sqrtCount, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.FloatType,
    });
    const positionUpdateQuad = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            positionIn: { value: positionRenderTarget.texture },
            delta: { value: 0.0 },
        },
        vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 1.0, 1.0);
        }
        `,
        fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D positionIn;
        uniform float delta;
        void main() {
            vec4 positionData = texture2D(positionIn, vUv);
            vec3 position = positionData.xyz;
            float scale = positionData.w;
            // Rotate position
            float theta = 0.001 * delta;
            float c = cos(theta);
            float s = sin(theta);
            mat2 rotation = mat2(c, -s, s, c);
            position.xz = rotation * position.xz;
            gl_FragColor = vec4(position, scale);
        }
        `,
    }));
    const copyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            inTexture: { value: positionRenderTarget.texture },
        },
        vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 1.0, 1.0);
        }
        `,
        fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D inTexture;
        void main() {
            gl_FragColor = texture2D(inTexture, vUv);
        }
        `,
    }));
    renderer.setRenderTarget(positionRenderTarget);
    renderer.clear();
    copyQuad.material.uniforms.inTexture.value = particlePositionTexture;
    copyQuad.render(renderer);





    /*particleGeometry.setAttribute("instancePosition", new THREE.InstancedBufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("instanceScale", new THREE.InstancedBufferAttribute(particleScales, 1));
    particleGeometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(particleColors, 3));*/
    particleGeometry.setAttribute("instanceId", new THREE.InstancedBufferAttribute(particleIds, 1));
    const expTexture = new THREE.WebGLRenderTarget(1024, 1024, {
        minFilter: THREE.LinearMipMapLinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.FloatType,
        format: THREE.RedFormat,
        generateMipmaps: true,
    });
    const expQuad = new FullScreenQuad(new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 1.0, 1.0);
        }
        `,
        fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            float dist = dot(vUv - 0.5, vUv - 0.5);
            float alpha = clamp(exp(-dist * 32.4), 0.0, 1.0);
            gl_FragColor = vec4(alpha, alpha, alpha, alpha);
        }
        `,
    }));
    renderer.setRenderTarget(expTexture);
    renderer.clear();
    expQuad.render(renderer);

    const particleMaterial = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: true,
        uniforms: {
            particleColorTexture: { value: particleColorTexture },
            particlePositionTexture: { value: positionRenderTarget.texture },
            attributeTextureSize: { value: new THREE.Vector2(sqrtCount, sqrtCount) },
            expTexture: { value: expTexture.texture },
            resolution: { value: new THREE.Vector2(clientWidth, clientHeight) },
        },
        vertexShader: /* glsl */ `
        attribute float instanceId;
        uniform sampler2D particleColorTexture;
        uniform sampler2D particlePositionTexture;
        uniform vec2 resolution;
        uniform vec2 attributeTextureSize;
        varying vec4 vColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vScale;
        void main() {
            vec2 idTexel = vec2(mod(instanceId, attributeTextureSize.x), floor(float(instanceId) / attributeTextureSize.x));
            vec2 attrUv = (idTexel + vec2(0.5)) / attributeTextureSize;
            vec4 instanceColor = texture2D(particleColorTexture, attrUv);
            vec4 instancePosData = texture2D(particlePositionTexture, attrUv);
            vec3 instancePosition = instancePosData.xyz;
            float instanceScale = instancePosData.w;
            vColor = instanceColor;
            vUv = uv;
            vec3 worldPos = instancePosition;
            vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            worldPos += cameraRight * position.x * instanceScale;
            worldPos += cameraUp * position.y * instanceScale;
            vWorldPos = worldPos;
            vScale = instanceScale;
            gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
        `,
        fragmentShader: /* glsl */ `
        varying vec4 vColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vScale;
        uniform sampler2D expTexture;
        uniform vec2 resolution;
        void main() {
            gl_FragColor = vColor;
            float alpha = texture2D(expTexture, vUv).r;
            gl_FragColor.a *= alpha;
            gl_FragColor.a *= clamp(distance(vWorldPos, cameraPosition) / vScale, 0.0, 1.0);
        }
        `,
    });
    const particleMesh = new THREE.Mesh(particleGeometry, particleMaterial);
    particleGeometry.instanceCount = COUNT;
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    // Post Effects
    const composer = new EffectComposer(renderer);
    const smaaPass = new SMAAPass(clientWidth, clientHeight);
    const effectPass = new ShaderPass(EffectShader);
    composer.addPass(effectPass);

    composer.addPass(new ShaderPass(GammaCorrectionShader));
    composer.addPass(smaaPass);
    const _worldPos = new THREE.Vector3();
    const keys = {};
    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
    });
    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;
    });
    const sortWorker = new Worker("radixWorker.js");
    const gl = renderer.getContext();

    function sortParticles() {
        camera.getWorldPosition(_worldPos);
        sortWorker.postMessage({
            particleIds,
            particlePositions,
            cameraX: _worldPos.x,
            cameraY: _worldPos.y,
            cameraZ: _worldPos.z,
            COUNT
        });
    }
    sortWorker.onmessage = () => {
        particleGeometry.attributes.instanceId.needsUpdate = true;
        sortParticles();
    }
    sortParticles();

    function readParticlePositions() {
        renderer.setRenderTarget(positionRenderTarget);
        readPixelsAsync(gl, 0, 0, sqrtCount, sqrtCount, gl.RGBA, gl.FLOAT, particlePositions).then(() => {
            readParticlePositions();
        });
    }
    readParticlePositions();
    const clock = new THREE.Clock();

    function animate() {
        const delta = clock.getDelta();
        renderer.setRenderTarget(positionRenderTarget2);
        renderer.clear();
        positionUpdateQuad.material.uniforms.delta.value = delta / 0.016666;
        positionUpdateQuad.render(renderer);
        renderer.setRenderTarget(positionRenderTarget);
        renderer.clear();
        copyQuad.material.uniforms.inTexture.value = positionRenderTarget2.texture;
        copyQuad.render(renderer);
        renderer.setRenderTarget(defaultTexture);
        renderer.clear();
        renderer.render(scene, camera);
        effectPass.uniforms["sceneDiffuse"].value = defaultTexture.texture;
        effectPass.uniforms["resolution"].value = new THREE.Vector2(clientWidth, clientHeight);
        composer.render();
        controls.update();
        stats.update();
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}
main();