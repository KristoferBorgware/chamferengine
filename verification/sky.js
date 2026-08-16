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

// ---- 4. the cloud sheet borrows the lattice and is NOT made of cells -------
// Invariant 10's construction is radius-independent -- same face, same path,
// same (q, r), evaluated at any radius -- so the hexagons are free above the
// surface as well as below it. But a cloud is NOT A CELL: it has no ID, no
// chunk, and no layer, because doc 03's layer field counts DOWNWARD from the
// crust top and clouds are up. That is not pedantry: an address is what makes a
// thing storable, and every mechanism this specification has for blocks is keyed
// by cell ID.
console.log('\n4. clouds borrow the lattice; they are not cells and have no address');
{
  const K = 1.20459;                 // doc 06's constant
  console.log('   what an address would buy, and why clouds decline it:');
  console.log('     the delta store   keyed by cell ID       doc 07');
  console.log('     the side table    keyed by cell ID       doc 27');
  console.log('     interest routing  by the chunk prefix    doc 22');
  console.log('     an edit message   names a cell ID        doc 30');
  console.log('   Give clouds IDs and all four become POSSIBLE, which is how a cosmetic');
  console.log('   sheet ends up in a save file. A cloud is a lattice point indexed by');
  console.log('   (face, i, j) into a transient buffer -- the way a vertex is indexed,');
  console.log('   not the way a block is.');
  console.log('');
  console.log('   lattice spacing at a given level, on the surface and at cloud altitude:');
  console.log('');
  console.log('   level   at the surface   at 300 m up   points on the whole sheet');
  for (const L of [3, 4, 5, 6, 7]){
    const s0 = K * R / 2**L, s1 = K * (R+300) / 2**L;
    const n = 10 * 4**L + 2;
    console.log(`   ${String(L).padStart(5)}   ${s0.toFixed(1).padStart(10)} m   ${s1.toFixed(1).padStart(9)} m   ${n.toLocaleString('en-US').padStart(10)}`);
  }
  console.log('');
  console.log('   A cloud does not need metre resolution. LEVEL 5 gives a ~64 m puff and');
  console.log('   10,242 POINTS for the entire sky -- against 41,943,042 cells for the');
  console.log('   surface at D 11. Four thousand times smaller than one layer of the');
  console.log('   world, and ten thousand floats is a buffer rather than a data structure.');
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
  console.log('   So the visible sheet is a few hundred points, not a few thousand, and it');
  console.log('   is a SHEET rather than a volume: no crust, no layers, no chunk, no delta');
  console.log('   store, no collision, and nothing doc 07 has to make room for.');
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

// ---- 6. the atmosphere is the one thing that does NOT scale ---------------
// Section 5 found that the moon SURVIVES scaling: angles are preserved, so a
// faithfully shrunk moon still subtends 0.52 deg. Scattering is the mirror
// image. Optical depth is (a property of air) x (a path length), and only the
// path length shrinks -- so the sky does not survive at all.
console.log('\n6. atmospheric scattering: the one sky feature that does not scale');
{
  const ER = 6371e3, H = 8500;              // Earth radius, atmospheric scale height
  const bG = 1.16e-5;                       // Rayleigh coefficient at 550 nm, per metre
  const bB = bG * Math.pow(550/440, 4);     // lambda^-4 -> blue
  const bR = bG * Math.pow(550/680, 4);     // -> red
  const scale = R / ER, Hs = H * scale;
  const horiz = (rad, h) => Math.sqrt(2*rad*h);

  console.log('   Rayleigh optical depth -- how much air the light actually crosses.');
  console.log('   tau below about 0.01 is a black sky; Earth\'s zenith blue is 0.24.');
  console.log('');
  console.log('   world                       scale height   zenith tau   horizon tau');
  console.log(`   Earth                       ${H.toLocaleString('en-US').padStart(9)} m   ${(bB*H).toFixed(3).padStart(10)}   ${(bB*horiz(ER,H)).toFixed(1).padStart(11)}`);
  console.log(`   this planet, air scaled too  ${Hs.toFixed(2).padStart(8)} m   ${(bB*Hs).toExponential(1).padStart(10)}   ${(bB*horiz(R,Hs)).toExponential(1).padStart(11)}`);
  console.log('');
  console.log(`   THE SCALED SKY IS ${(H/Hs).toFixed(0)}x TOO THIN, and that is not a tuning problem --`);
  console.log('   it is four orders of magnitude. Standing on this planet with correctly');
  console.log('   scaled air, the daytime sky is BLACK with stars in it, because there is');
  console.log('   barely any air between you and space.');
  console.log('');
  console.log('   Section 5 found the opposite for the moon, and the pair is the point:');
  console.log('');
  console.log('     ANGULAR SIZE is scale-free      scale the moon and it looks identical');
  console.log('     OPTICAL DEPTH is not            it is (a property of air) x (a path),');
  console.log('                                     and only the path shrinks');
  console.log('');
  console.log('   So the two ends of the sky fail in opposite directions and land in the');
  console.log('   same place: BOTH ARE ART ASSETS. The moon because scaling preserves a');
  console.log('   number that was never dramatic; the sky because scaling destroys it.');
  console.log('');
  console.log('   What it would take to get an Earth-like sky here, pick either:');
  console.log(`     air ${(H/Hs).toFixed(0)}x denser than real air, or`);
  console.log(`     an atmosphere ${H.toLocaleString('en-US')} m tall on a ${R} m planet -- ${(H/R).toFixed(1)}x the radius,`);
  console.log('     which is a pebble suspended inside a ball of air.');
  console.log('   Neither is a physical planet, so neither is a defensible default.');
  console.log('');
  console.log('   AND THE HORIZON GLOW HAS NO GEOMETRY TO WORK WITH EITHER. On Earth the');
  console.log(`   sky is bright at the horizon because the grazing path is ${(horiz(ER,H)/1000).toFixed(0)} km of air,`);
  console.log(`   giving tau ${(bB*horiz(ER,H)).toFixed(1)} -- saturated. Here that path is ${horiz(R,Hs).toFixed(0)} m, and doc 13's`);
  console.log('   ground horizon is only 76 m away in any case. There is no long sightline');
  console.log('   to accumulate color along, whatever the air is made of.');
  console.log('');
  console.log('   THE RECOMMENDATION IS THEREFORE SPECIFIC: run whichever scattering model');
  console.log('   you like on a FICTIONAL EARTH-SIZED ATMOSPHERE. Preetham, Hosek-Wilkie and');
  console.log('   Bruneton are all parameterised by planet radius and scale height -- feed');
  console.log('   them Earth\'s, not this planet\'s. Only the SUN DIRECTION comes from the');
  console.log('   real world, and doc 16 already has it as a world vector.');
  console.log('');
  console.log('   That composes correctly with section 1 rather than fighting it: the');
  console.log('   gradient depends on the angle between the view direction and the sun, and');
  console.log('   both are real. So sunsets move when the player walks -- the same 2.12 h');
  console.log('   effect -- on an atmosphere that is entirely invented.');
  console.log('');
  console.log(`   (Red for contrast: zenith tau ${(bR*H).toFixed(3)} on Earth against ${(bB*H).toFixed(3)} for blue.`);
  console.log('   That ratio is what makes the sky blue and the sunset red, and it is a');
  console.log('   property of the lambda^-4 law rather than of any planet, so it survives.)');
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
console.log('   CLOUDS: the LATTICE is reused, the ADDRESS is not. The construction is');
console.log('   radius-independent so the hexagons are free; but there is no layer number');
console.log('   for a cloud -- layers count downward -- and an address is what makes a');
console.log('   thing storable, so withholding it keeps "never stored" true by');
console.log('   construction. Level 5 is a 64 m puff and 10,242 points. Wind is ONE AXIS AND ONE');
console.log('   RATE -- rotate the sample point before the lookup -- because the hairy ball');
console.log('   theorem forbids a uniform wind and rigid rotation puts the two calm points');
console.log('   at the poles, where an atmosphere puts them anyway.');
console.log('');
console.log('   ATMOSPHERE: the ONE sky feature that does not survive scaling. Optical');
console.log('   depth is a path length through a medium, and only the path shrinks, so');
console.log('   correctly scaled air is 3,748x too thin and the daytime sky is BLACK.');
console.log('   Run the scattering model on a FICTIONAL EARTH-SIZED atmosphere and take');
console.log('   only the sun direction from the real world.');
console.log('');
console.log('   MOON: a scaled-down real moon is still 0.52 deg, so the size is an art');
console.log('   decision and the moon is a painted disc. Give it a finite distance anyway:');
console.log('   walking round the planet shifts it a couple of degrees, and that parallax');
console.log('   is the cheapest thing in this file.');
