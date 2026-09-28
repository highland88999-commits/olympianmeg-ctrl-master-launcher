// Beehive shaders — preserved verbatim from the original single-file app.
// Source repo: highland88999-commits/Beehive-Simulation (index.html).
// Only the two telemetry trackers were removed; shader code is untouched.

export const VERTEX_SHADER = `
        attribute vec4 position;
        void main() { gl_Position = position; }
    `;

export const FRAGMENT_SHADER = `
        precision highp float;
        uniform float u_time;
        uniform vec2 u_res;
        uniform vec2 u_camRot;
        uniform float u_zoom; 

        // Rotation matrix
        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        // 2D Hexagon SDF
        float sdHexagon(vec2 p, float r) {
            const vec3 k = vec3(-0.8660254, 0.5, 0.5773503);
            p = abs(p);
            p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
            p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
            return length(p) * sign(p.y);
        }

        // Hex Grid Mapping
        vec4 hexGrid(vec2 p) {
            vec2 r = vec2(1.0, 1.7320508);
            vec2 h = r * 0.5;
            vec2 a = mod(p, r) - h;
            vec2 b = mod(p - h, r) - h;
            vec2 cell = dot(a,a) < dot(b,b) ? a : b;
            vec2 id = p - cell;
            return vec4(cell, id);
        }

        vec2 opU(vec2 d1, vec2 d2) {
            return (d1.x < d2.x) ? d1 : d2;
        }

        // Bees roaming the massive room
        float sdBee(vec3 p, vec3 pos, float timeOffset) {
            p -= pos;
            p.xy *= rot(cos(u_time * 2.0 + timeOffset) * 0.4);
            p.yz *= rot(sin(u_time * 1.5 + timeOffset) * 0.3);
            float body = length(p - vec3(0.0, 0.0, clamp(p.z, -0.3, 0.25))) - 0.15;
            float head = length(p - vec3(0.0, -0.04, 0.35)) - 0.1;
            return min(body, head);
        }

        float sdBeeWings(vec3 p, vec3 pos, float timeOffset) {
            p -= pos;
            p.xy *= rot(cos(u_time * 2.0 + timeOffset) * 0.4);
            p.yz *= rot(sin(u_time * 1.5 + timeOffset) * 0.3);
            vec3 wp = p;
            wp.y -= 0.12; 
            wp.z -= 0.05; 
            wp.x = abs(wp.x) - 0.08; 
            float flap = sin(u_time * 250.0 + timeOffset) * 0.8; 
            wp.xy *= rot(flap);
            return length(wp - vec3(clamp(wp.x, 0.0, 0.45), 0.0, clamp(wp.z, -0.15, 0.2))) - 0.005;
        }

        // Master Geometry Map
        vec2 map(vec3 p) {
            vec2 res = vec2(1000.0, -1.0);
            
            // --- ROOM-SIZED CYLINDRICAL HIVE MAPPING ---
            // Convert to polar coordinates to wrap the grid around a massive cylinder
            float r = length(p.xz);
            float a = atan(p.z, p.x);
            
            // 80 cells around the circumference creates a room ~25 meters across
            float numCells = 80.0;
            float R = numCells / 6.2831853; 
            
            // Wrap coordinates flawlessly
            vec2 uvHex = vec2((a / 6.2831853) * numCells, p.y);
            vec4 h = hexGrid(uvHex);
            
            // Distance within the 2D mapped cell
            float dHex = sdHexagon(h.xy, 0.45);
            
            // Extrude radially to create 3D walls
            float walls = abs(dHex) - 0.035;
            float radialDepth = r - R; // 0 at the inner wall, positive deeper into the comb
            
            // Random honey levels per cell
            float n = fract(sin(dot(h.zw, vec2(12.9898, 78.233))) * 43758.5453);
            float honeyDepth = 0.2 + n * 2.0; 
            
            // Fill cells with honey deeper in the wall
            float honeyFill = max(dHex + 0.035, honeyDepth - radialDepth);
            
            // Combine walls and honey
            float dComb = min(walls, honeyFill);
            
            // Bound the honeycomb to a giant cylindrical ring (thickness 2.0, height 20.0)
            float boundR = abs(radialDepth - 1.0) - 1.0;
            float boundY = abs(p.y) - 10.0;
            dComb = max(dComb, max(boundR, boundY));
            
            // Organic micro-texture
            dComb -= 0.003 * sin(p.x*25.0)*sin(p.y*25.0)*sin(p.z*25.0);
            
            res = opU(res, vec2(dComb, 1.0)); // Mat 1: Wall & Honey
            
            // --- ROOM BOUNDARIES ---
            // Solid ceiling
            res = opU(res, vec2(10.0 - p.y, 1.0)); 
            
            // Giant honey pool on the floor with slow ripples
            float ripples = 0.08 * sin(length(p.xz) * 3.0 - u_time * 1.5);
            res = opU(res, vec2(p.y + 10.0 - ripples, 4.0)); // Mat 4: Pool
            
            // --- INJECT GIANT SWARM ---
            for(float i = 0.0; i < 20.0; i++) {
                float t0 = u_time * 1.2 + i * 7.13;
                // Distribute bees organically throughout the room
                vec3 pos = vec3(
                    sin(t0 * 0.45) * 9.0,
                    sin(t0 * 0.3) * 7.0,
                    cos(t0 * 0.55) * 9.0
                );
                res = opU(res, vec2(sdBee(p, pos, i), 2.0));      
                res = opU(res, vec2(sdBeeWings(p, pos, i), 3.0)); 
            }
            
            return res;
        }

        // High-precision Normal Map
        vec3 getNormal(vec3 p) {
            vec2 e = vec2(0.002, 0.0);
            return normalize(vec3(
                map(p + e.xyy).x - map(p - e.xyy).x,
                map(p + e.yxy).x - map(p - e.yxy).x,
                map(p + e.yyx).x - map(p - e.yyx).x
            ));
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / u_res.y;
            
            float yaw = u_camRot.x;
            float pitch = u_camRot.y;
            
            // Camera stands in the center of the massive room
            vec3 ro = vec3(0.0, 0.0, 0.0);
            
            // Apply mouse/touch look rotation
            vec3 ta = vec3(0.0, 0.0, 1.0);
            ta.yz *= rot(-pitch);
            ta.xz *= rot(-yaw);
            
            vec3 ww = normalize(ta);
            vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
            vec3 vv = normalize(cross(uu, ww));
            
            // Apply zoom (dynamically scales FOV so you can zoom deeply into the comb walls)
            vec3 rd = normalize(uv.x * uu + uv.y * vv + u_zoom * ww);
            
            vec2 res = vec2(0.0);
            float t = 0.0;
            float glow = 0.0;
            float poolReflectGlow = 0.0;
            
            // Extended raymarching for massive room scale
            for(int i = 0; i < 180; i++) {
                vec3 p = ro + rd * t;
                res = map(p);
                if(res.x < 0.001 || t > 40.0) break;
                t += res.x;
                
                // Volumetric honey bloom
                if(res.y == 1.0) glow += 0.001 / (0.01 + res.x * res.x);
                if(res.y == 4.0) poolReflectGlow += 0.002 / (0.05 + res.x * res.x);
            }
            
            vec3 col = vec3(0.01, 0.005, 0.0);
            
            if(t < 40.0) {
                vec3 p = ro + rd * t;
                vec3 n = getNormal(p);
                
                // Warm, ambient central light filling the room
                vec3 lightPos = vec3(sin(u_time)*2.0, 4.0, cos(u_time)*2.0); 
                vec3 l = normalize(lightPos - p);
                vec3 v = -rd;
                vec3 h = normalize(l + v);
                
                float diff = max(dot(n, l), 0.0);
                float spec = pow(max(dot(n, h), 0.0), 40.0);
                float fresnel = pow(1.0 - max(dot(n, v), 0.0), 5.0);
                
                // Deep Ambient Occlusion for room corners and cell depths
                float ao = clamp(map(p + n * 0.4).x * 2.5, 0.0, 1.0); 
                
                if(res.y == 1.0) {
                    // WALLS & HONEY CELLS
                    // Backlit Subsurface Scattering approximation for deep wax look
                    float sss = smoothstep(0.0, 1.0, map(p + rd * 0.6).x); 
                    
                    vec3 waxBase = vec3(0.85, 0.45, 0.05);
                    vec3 honeyGlow = vec3(1.3, 0.6, 0.05); 
                    
                    col = waxBase * diff * ao;
                    col += honeyGlow * sss * 1.2; // Glowing transmission through cells
                    col += vec3(1.0, 0.9, 0.5) * spec * 0.8;
                    col += waxBase * fresnel * 0.5;
                } 
                else if(res.y == 2.0) {
                    // BEE BODIES
                    float stripes = step(0.5, fract(p.z * 10.0 + p.x * 3.0)); 
                    vec3 beeCol = mix(vec3(0.03), vec3(1.0, 0.8, 0.0), stripes);
                    
                    col = beeCol * diff * ao;
                    col += vec3(0.5) * spec * 0.4; 
                    col += vec3(0.9, 0.8, 0.3) * fresnel * 1.5; 
                } 
                else if(res.y == 3.0) {
                    // WINGS
                    vec3 wingCol = vec3(0.9, 0.95, 1.0);
                    col = wingCol * diff * 0.2;
                    col += vec3(1.0) * spec * 4.0; 
                    col += vec3(0.7, 0.9, 1.0) * fresnel * 3.0; 
                }
                else if(res.y == 4.0) {
                    // HONEY POOL (FLOOR)
                    vec3 poolBase = vec3(0.8, 0.3, 0.0);
                    
                    // Fake environmental reflection based on normal
                    float fakeReflect = smoothstep(-1.0, 1.0, reflect(rd, n).y);
                    vec3 reflectCol = mix(vec3(0.9, 0.4, 0.0), vec3(1.0, 0.8, 0.2), fakeReflect);
                    
                    col = poolBase * diff * ao;
                    col += reflectCol * fresnel * 2.0;
                    col += vec3(1.0, 0.8, 0.4) * spec * 3.0; // High gloss
                }
            }
            
            // Atmospheric depth fading to rich dark amber
            float fog = 1.0 - exp(-t * 0.015);
            col = mix(col, vec3(0.04, 0.01, 0.0), fog);
            
            // Apply Volumetric Bloom
            col += vec3(1.0, 0.5, 0.05) * glow * 0.4;
            col += vec3(1.0, 0.7, 0.1) * poolReflectGlow * 0.2;
            
            // Cinematic Tonemapping & Sharpness Adjustment
            col *= 1.0 - 0.4 * length(uv); // Vignette
            col = col / (1.0 + col);       // Reinhard
            col = pow(col, vec3(0.4545));  // Gamma Correction

            gl_FragColor = vec4(col, 1.0);
        }
    `;
