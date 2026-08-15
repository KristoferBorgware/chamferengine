// What is above you, on a planet you can walk around in two hours.
//
//   node verification/sky.js
//
// A skybox, clouds and a moon are the three things this specification has
// discussed and never written down (doc 11). They look like pure decoration, and
// on a normal-sized world they are: a cube at infinity, a scrolling texture, a
// sprite. This planet is 1,700 m across and that changes all three, because the
// player is the fastest-moving thing in the sky.
//
// Everything here is PRESENTATION (doc 29): client-side, never compared between
// machines, and therefore allowed transcendentals that doc 23 forbids in the
// generator. That freedom is used, and it is why none of this is expensive.

const R = 1700;                       // doc 06's worked planet, 1 m blocks at D 11
const WALK = 1.4;                     // m/s, the same walking speed light.js uses
const EYE = 1.7;                      // m
const DEG = Math.PI / 180;
const CIRC = 2 * Math.PI * R;

console.log('sky.js -- the skybox, clouds and the moon on a 1,700 m planet');

// ---- 1. the sky turns because YOU move -------------------------------------
// In a flat world "up" is a constant, so the sky is a backdrop and only the
// camera's heading changes. Here up is normalize(position) (invariant 8), so
// walking rotates your entire frame against a fixed celestial sphere.
console.log('\n1. the sky turns because you walk, not because it moves');
{
  console.log(`   circumference ${CIRC.toFixed(0)} m, walked at ${WALK} m/s`);
  console.log('');
  console.log('   walk this far   your "up" turns by   which is');
  const rows = [[10,'a few paces'], [100,'across a clearing'], [500,'a short stroll'],
                [CIRC/4,'a quarter of the way round'], [CIRC,'all the way round']];
  for (const [s, what] of rows){
    const deg = (s / R) / DEG;
    console.log(`   ${s.toFixed(0).padStart(9)} m   ${deg.toFixed(2).padStart(11)}°   ${what}`);
  }
  console.log('');
  console.log(`   Walking ${CIRC.toFixed(0)} m turns you through a full 360°, so a player who walks`);
  console.log(`   round the planet sees the ENTIRE celestial sphere pass overhead -- in`);
  console.log(`   ${(CIRC/WALK/3600).toFixed(2)} hours, without waiting for anything.`);
  console.log('');
  console.log('   THE CONSEQUENCE FOR THE SKYBOX IS THE WHOLE DESIGN: it is fixed in WORLD');
  console.log('   space, not view space. A classic skybox is drawn centred on the camera and');
  console.log('   never rotates, because in a flat world every player shares one "up". Do');
  console.log('   that here and the stars follow you around the planet, which reads as the');
  console.log('   sky being painted on the inside of your helmet.');
}

// ---- 2. you can outwalk the sunrise -----------------------------------------
console.log('\n2. a player outwalks the sun unless the day is short');
{
  // doc 16 measured the terminator speed as circumference / dayLength. Compare it
  // to the player rather than to the ground.
  console.log('   day length   terminator speed   a walking player is');
  for (const hours of [0.5, 1, 2.12, 6, 12, 24]){
    const v = CIRC / (hours * 3600);
    const ratio = WALK / v;
    const verdict = ratio > 1.02 ? `${ratio.toFixed(1)}x FASTER -- outwalks it`
                  : ratio < 0.98 ? `${(1/ratio).toFixed(1)}x slower`
                  : 'exactly matched';
    console.log(`   ${hours.toFixed(2).padStart(9)} h   ${v.toFixed(2).padStart(12)} m/s   ${verdict}`);
  }
  console.log('');
  console.log(`   Below about ${(CIRC/WALK/3600).toFixed(2)} h of day length the sun outruns the player and`);
  console.log('   the sky behaves like a normal game sky. Above it, A PLAYER WALKING WEST');
  console.log('   CAN HOLD THE SUNSET IN PLACE, or walk east into dawn. That is not a bug to');
  console.log('   design around; it is the most legible way this world says it is small,');
  console.log('   and it costs nothing because doc 16 already computes lighting per cell');
  console.log('   from one dot product.');
}

// ---- 3. wind cannot blow the same way everywhere ---------------------------
// Invariant 8 says there is no global north because of the hairy ball theorem.
// The same theorem applies to wind, and it is the reason a "wind direction"
// cannot be a world vector.
console.log('\n3. wind must have calm points, and only one field earns its shape');
{
  const norm = v => { const l = Math.sqrt(v[0]**2+v[1]**2+v[2]**2); return [v[0]/l, v[1]/l, v[2]/l]; };
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const len = v => Math.sqrt(dot(v,v));
  const AX = norm([0,1,0]);

  // A: take a world direction and project it onto the surface -- the obvious
  //    first idea, and the one invariant 8 already warns about for headings.
  // B: rigid rotation about an axis -- what a spinning planet does.
  const fieldA = u => { const d = dot(AX,u); return [AX[0]-d*u[0], AX[1]-d*u[1], AX[2]-d*u[2]]; };
  const fieldB = u => cross(AX, u);

  // Both are zero exactly at +/-AX, and that is not sampled -- it is evaluated.
  console.log('   Both candidate fields, evaluated AT the two points the theorem predicts:');
  for (const [name, f] of [['project a world vector', fieldA], ['rigid rotation', fieldB]])
    console.log(`     ${name.padEnd(24)} |v| at +axis = ${len(f(AX)).toExponential(1)}`
      + `,  at -axis = ${len(f(AX.map(x=>-x))).toExponential(1)}`);
  console.log('   Exactly two calm points each, and there is no way to have fewer: the');
  console.log('   hairy ball theorem is the same one invariant 8 cites for "no global');
  console.log('   north". A wind field tangent to a sphere is zero somewhere.');
  console.log('');

  // How big is the calm patch a player would actually notice?
  console.log('   How much of the planet is becalmed, by threshold:');
  console.log('     speed below   share of the surface   band within');
  for (const frac of [0.05, 0.10, 0.25]){
    // |v| = sin(theta) for both fields, so the calm cap is theta < asin(frac)
    const th = Math.asin(frac);
    const cap = 2 * (1 - Math.cos(th)) / 2;      // two caps / total sphere area
    console.log(`     ${(100*frac).toFixed(0).padStart(10)}%   ${(100*cap).toFixed(2).padStart(19)}%`
      + `   ${(th/DEG).toFixed(1)}° of an axis pole`);
  }
  console.log('   At a 10% threshold the doldrums are 0.5% of the sky and sit over the');
  console.log('   poles. A player will not find them by accident.');
  console.log('');

  // The real difference: does the field pile air up?
  const divergence = (f, u) => {
    const t = Math.abs(u[2]) < 0.9 ? [0,0,1] : [1,0,0];
    const e1 = norm(cross(t, u)), e2 = cross(u, e1);
    const h = 1e-5, step = (e, sgn) => norm([u[0]+sgn*h*e[0], u[1]+sgn*h*e[1], u[2]+sgn*h*e[2]]);
    return (dot(f(step(e1,1)),e1) - dot(f(step(e1,-1)),e1)) / (2*h)
         + (dot(f(step(e2,1)),e2) - dot(f(step(e2,-1)),e2)) / (2*h);
  };
  let seed = 20260815;
  const rnd = () => { seed = (Math.imul(seed,1103515245)+12345) >>> 0; return seed/4294967296; };
  const N = 50000;
  let sumA = 0, sumB = 0, maxA = 0, maxB = 0;
  for (let i=0;i<N;i++){
    const z = 2*rnd()-1, t = 2*Math.PI*rnd(), r = Math.sqrt(1-z*z);
    const u = [r*Math.cos(t), r*Math.sin(t), z];
    const da = Math.abs(divergence(fieldA,u)), db = Math.abs(divergence(fieldB,u));
    sumA += da; sumB += db; maxA = Math.max(maxA,da); maxB = Math.max(maxB,db);
  }
  console.log(`   AND THE TWO ARE NOT INTERCHANGEABLE. Divergence over ${N.toLocaleString('en-US')} points --`);
  console.log('   how much the field piles air up or thins it out:');
  console.log('');
  console.log('     field                      mean |div|      max |div|');
  console.log(`     project a world vector   ${sumA/N < 1e-9 ? '0' : (sumA/N).toFixed(4).padStart(12)}   ${maxA.toFixed(4).padStart(12)}`);
  console.log(`     rigid rotation           ${(sumB/N).toExponential(1).padStart(12)}   ${maxB.toExponential(1).padStart(12)}`);
  console.log('');
  console.log('   Rigid rotation is DIVERGENCE-FREE to numerical noise -- it is a Killing');
  console.log('   field, it moves the sphere along itself. The projected vector is not: it');
  console.log('   pours air out of one pole and into the other, so a cloud texture advected');
  console.log('   by it stretches at one end and bunches at the other, permanently.');
  console.log('');
  console.log('   Speed by latitude falls out right as well:');
  console.log('     latitude   speed / equatorial');
  for (const lat of [0, 26.565, 45, 60, 90])
    console.log(`     ${lat.toFixed(3).padStart(8)}°   ${Math.cos(lat*DEG).toFixed(3)}`);
  console.log('   Fastest at the equator, calm at the poles -- what a real atmosphere does,');
  console.log('   and what a player expects without being told.');
  console.log('');
  console.log('   SO WIND IS ONE AXIS AND ONE RATE. Rotate the cloud sample point about that');
  console.log('   axis by (time x rate) before the noise lookup. No stored vectors, no');
  console.log('   per-cell field, and nothing that violates invariant 8 -- the axis is a');
  console.log('   property of the WORLD, never a heading carried by a cell.');
}

// ---- 4. the cloud layer is the same grid at a bigger radius ----------------
// Invariant 10: the tessellation is identical at every layer -- same face, same
// path, same (q, r), evaluated at a different radius. Clouds are ABOVE the
// crust rather than in it, and that costs nothing new.
console.log('\n4. a cloud sheet is the existing grid, evaluated higher up');
{
  const K = 1.20459;                 // doc 06's constant
  console.log('   cell size at a given level, on the surface and at cloud altitude:');
  console.log('');
  console.log('   level   surface cell   at 300 m up   cells on the whole sheet');
  for (const L of [3, 4, 5, 6, 7]){
    const s0 = K * R / 2**L, s1 = K * (R+300) / 2**L;
    const n = 10 * 4**L + 2;
    console.log(`   ${String(L).padStart(5)}   ${s0.toFixed(1).padStart(10)} m   ${s1.toFixed(1).padStart(9)} m   ${n.toLocaleString('en-US').padStart(10)}`);
  }
  console.log('');
  console.log('   A cloud does not need metre resolution. LEVEL 5 gives a ~64 m puff and');
  console.log('   10,242 cells for the entire sky -- against 41,943,042 for the surface at');
  console.log('   D 11. The whole cloud sheet is four thousand times smaller than one');
  console.log('   layer of the world.');
  console.log('');
  // how much of the sheet is in view
  const horizon = h => R * Math.acos(R / (R + h));
  for (const alt of [150, 300, 600]){
    const reach = horizon(EYE) + horizon(alt);
    const frac = 2 * Math.PI * R * R * (1 - Math.cos(reach / R)) / (4 * Math.PI * R * R);
    console.log(`   clouds at ${String(alt).padStart(3)} m are visible out to ${reach.toFixed(0).padStart(5)} m`
      + `  = ${(100*frac).toFixed(1).padStart(4)}% of the sky sheet`);
  }
  console.log('');
  console.log('   An elevated object clears the horizon from much further away than the');
  console.log('   ground does -- doc 14 already uses R*acos(R/(R+h)) for a distant peak.');
  console.log('   So the visible cloud sheet is a few hundred cells, not a few thousand,');
  console.log('   and it is a FLAT-SHADED SHEET rather than a volume: no crust, no layers,');
  console.log('   no delta store, no collision.');
}

// ---- 5. the moon, and why its size is an art decision ----------------------
console.log('\n5. the moon: angular size is scale-free, so someone has to choose it');
{
  const EARTH_R = 6371e3, MOON_R = 1737e3, MOON_D = 384400e3;
  const scale = R / EARTH_R;
  const ang = 2 * Math.atan(MOON_R / MOON_D) / DEG;
  console.log(`   Scale the real Earth-Moon system down to R = ${R} m (factor ${scale.toExponential(2)}):`);
  console.log(`     moon radius   ${(MOON_R*scale).toFixed(0)} m`);
  console.log(`     distance      ${(MOON_D*scale/1000).toFixed(1)} km`);
  console.log(`     angular size  ${ang.toFixed(2)}°  <- UNCHANGED, because scaling preserves angles`);
  console.log('');
  console.log('   That is the finding: a faithfully scaled moon looks EXACTLY like the real');
  console.log('   one, which is half a degree -- about the width of a fingernail at arm\'s');
  console.log('   length. Every game that wants a moon you notice makes it bigger, and there');
  console.log('   is no physical size that gets you there. SO THE ANGULAR SIZE IS AN ART');
  console.log('   DECISION, and once it is, the moon is a painted disc rather than a place.');
  console.log('');
  // parallax from walking round the planet
  for (const angSize of [ang, 2, 5]){
    const dist = MOON_R * scale / Math.tan(angSize/2 * DEG);
    const par = 2 * Math.atan(R / dist) / DEG;
    console.log(`   drawn at ${angSize.toFixed(2).padStart(5)}° -> sits ${(dist/1000).toFixed(2).padStart(7)} km away`
      + `, shifts ${par.toFixed(2).padStart(5)}° as you walk round`);
  }
  console.log('');
  console.log('   The parallax column is the one that matters and it is easy to miss. On a');
  console.log('   planet you can circle in two hours, WALKING MOVES YOU 3,400 m ACROSS the');
  console.log('   moon\'s line of sight, so it shifts against the stars by a couple of');
  console.log('   degrees -- several times its own width. Put the moon in the skybox');
  console.log('   texture, at infinity, and that shift is missing; the moon will look');
  console.log('   pinned to the stars in a way players read as cheap without knowing why.');
  console.log('   Draw it as an object at a finite distance and the parallax is free.');
}

console.log('\nverdict');
console.log('   All three are cosmetic, all three are PRESENTATION (doc 29) and therefore');
console.log('   client-only, free to differ between machines, and allowed the');
console.log('   transcendentals doc 23 forbids in the generator. None of it is expensive.');
console.log('   What makes them non-trivial is not cost -- it is that a 1,700 m planet');
console.log('   breaks the assumption every one of the standard techniques rests on:');
console.log('   that the player does not move far enough to matter.');
console.log('');
console.log('   SKYBOX: fixed in WORLD space, not view space. Walking rotates you through');
console.log(`   the whole celestial sphere in ${(CIRC/WALK/3600).toFixed(2)} h, and a camera-locked skybox`);
console.log('   turns that into stars glued to your head.');
console.log('');
console.log('   CLOUDS: the same addressing at a bigger radius (invariant 10). Level 5 is');
console.log('   a 64 m puff and 10,242 cells for the entire sky. Wind is ONE AXIS AND ONE');
console.log('   RATE -- rotate the sample point before the lookup -- because the hairy ball');
console.log('   theorem forbids a uniform wind and rigid rotation puts the two calm points');
console.log('   at the poles, where an atmosphere puts them anyway.');
console.log('');
console.log('   MOON: a scaled-down real moon is still 0.52 deg, so the size is an art');
console.log('   decision and the moon is a painted disc. Give it a finite distance anyway:');
console.log('   walking round the planet shifts it a couple of degrees, and that parallax');
console.log('   is the cheapest thing in this file.');
