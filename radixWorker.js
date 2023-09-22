let particleClone = null;
let sorted = null;
let sortedIds = null;
const bins = new Uint32Array(256);
let fArr;
let uArr;
self.onmessage = (ev) => {
    const {
        particleIds,
        particlePositions,
        cameraX,
        cameraY,
        cameraZ,
        COUNT
    } = ev.data;
    if (!particleClone) {
        particleClone = new Uint32Array(COUNT);
        sorted = new Uint32Array(COUNT);
        sortedIds = new Uint32Array(COUNT);
        fArr = new Float32Array(COUNT);
        uArr = new Uint32Array(fArr.buffer);
    }
    for (let i = 0; i < COUNT; i++) {
        particleClone[i] = i;
        const x = particlePositions[i * 4 + 0];
        const y = particlePositions[i * 4 + 1];
        const z = particlePositions[i * 4 + 2];
        const xDiff = x - cameraX;
        const yDiff = y - cameraY;
        const zDiff = z - cameraZ;
        fArr[i] = xDiff * xDiff + yDiff * yDiff + zDiff * zDiff;
    }
    for (let i = 0; i < 4; i++) {
        bins.fill(0);
        const shift = i * 8;

        // Counting phase
        for (let j = 0; j < COUNT; j++) {
            bins[(uArr[j] >> shift) & 255]++;
        }

        // Accumulating phase
        for (let j = 1; j < 256; j++) {
            bins[j] += bins[j - 1];
        }

        // Sorting phase
        for (let j = COUNT - 1; j >= 0; j--) {
            const binIdx = (uArr[j] >> shift) & 255;
            const idx = --bins[binIdx];
            sorted[idx] = uArr[j];
            sortedIds[idx] = particleClone[j];
        }
        uArr.set(sorted);
        particleClone.set(sortedIds);
    }
    particleClone.reverse();

    particleIds.set(particleClone);
    self.postMessage({});
}