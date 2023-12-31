import * as THREE from 'https://cdn.skypack.dev/three@0.150.0';
const EffectShader = {

    uniforms: {

        'sceneDiffuse': { value: null },
        'rHist': { value: null },
        'rMax': { value: null },
        'gHist': { value: null },
        'gMax': { value: null },
        'bHist': { value: null },
        'bMax': { value: null },
        'resolution': { value: new THREE.Vector2(1.0, 1.0) },
    },

    vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

    fragmentShader: /* glsl */ `
		uniform highp sampler2D sceneDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;
    #include <dithering_pars_fragment>
		void main() {
      vec4 diffuse = texture2D(sceneDiffuse, vUv);
      gl_FragColor = vec4(diffuse.rgb, 1.0);
      #include <dithering_fragment>
		}`

};

export { EffectShader };