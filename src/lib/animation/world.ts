import type { JournalEntry, Place } from "../journal";

const INK = "rgba(43,38,33,.64)";
const HAND = '"KaiTi", "STKaiti", "Segoe Print", cursive';
type Point = [number, number];

function random(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function stroke(ctx: CanvasRenderingContext2D, points: Point[], seed: number, width = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const dx = (random(seed + i * 11) - .5) * 1.1;
    const dy = (random(seed + i * 13 + 7) - .5) * .9;
    if (!i) ctx.moveTo(x + dx, y + dy);
    else ctx.lineTo(x + dx, y + dy);
  });
  ctx.stroke();
  ctx.restore();
}

function wash(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const fill = ctx.createRadialGradient(0, 0, .08, 0, 0, 1);
  fill.addColorStop(0, color);
  fill.addColorStop(.5, color);
  fill.addColorStop(1, "transparent");
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, t: number, seed: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  wash(ctx, 0, -91, 74, 65, "rgba(83,96,85,.14)");
  stroke(ctx, [[-3, 0], [-1, -60], [-8, -127]], seed, 1.7);
  stroke(ctx, [[4, 0], [4, -50], [14, -95]], seed + 8, 1.2);
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const base = -30 - i * 5.5;
    const reach = (20 + random(i + 17) * 33) * side;
    const sway = Math.sin(t * .00026 + i * .7) * 2.2;
    stroke(ctx, [[0, base], [reach * .6 + sway, base - 24], [reach + sway, base - 29]], seed + i * 23, .65, .7);
    for (let j = 0; j < 5; j++) {
      const lx = reach * (.4 + j * .14) + sway;
      const ly = base - 22 - random(j + i * 21) * 16;
      stroke(ctx, [[lx - 4, ly + 6], [lx, ly], [lx + 5, ly + 2]], seed + i + j, .8, .48);
    }
  }
  ctx.restore();
}

function cottage(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number, lit: boolean, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(124,111,96,.18)";
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-40, -45); ctx.lineTo(0, -74); ctx.lineTo(43, -45); ctx.lineTo(43, 0); ctx.fill();
  stroke(ctx, [[-47,-43], [0,-77], [51,-42]], seed, 1.8);
  stroke(ctx, [[-40,-43], [-40,0], [43,0], [43,-43]], seed + 3, 1.2);
  stroke(ctx, [[-8,0], [-8,-29], [8,-29], [8,0]], seed + 19, .9);
  if (lit) {
    wash(ctx, 24, -26, 24, 26, `rgba(194,149,70,${.15 + Math.sin(t * .0004) * .02})`);
    ctx.fillStyle = "rgba(203,165,85,.58)";
    ctx.fillRect(17, -34, 15, 16);
  }
  stroke(ctx, [[17,-18], [17,-34], [32,-34], [32,-18], [17,-18]], seed + 7, .8);
  stroke(ctx, [[24,-34], [24,-18]], seed + 11, .6);
  stroke(ctx, [[-18,-64], [-18,-81], [-10,-81], [-10,-71]], seed + 6, 1);
  for (let i = 0; i < 7; i++) stroke(ctx, [[-34 + i*10,-42], [-34 + i*10,-7]], seed + i, .5, .3);
  for (let i = 0; i < 3; i++) {
    const rise = (t * .003 + i * 15) % 50;
    stroke(ctx, [[-15,-86-rise], [-11+Math.sin(t*.0002+i)*6,-93-rise], [-16,-99-rise]], seed + i, .6, (1-rise/50)*.3);
  }
  ctx.restore();
}

function bench(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number) {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  wash(ctx, 0, 9, 54, 17, "rgba(65,55,46,.10)");
  for (let i = 0; i < 3; i++) stroke(ctx, [[-32,-24+i*5], [32,-26+i*5]], seed+i, 1.6);
  stroke(ctx, [[-36,-6],[25,-9],[35,-4],[-26,0],[-36,-6]], seed+8, 1.4);
  for(const x of [-25,26]) {
    stroke(ctx, [[x,-28],[x,-6],[x-4,14]], seed+x, 1.2);
    stroke(ctx, [[x+8,-3],[x+10,12]], seed+x+8, 1);
  }
  ctx.restore();
}

function pond(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  const x = w*.77, y = h*.79;
  wash(ctx,x,y,w*.14,h*.08,"rgba(111,133,137,.24)");
  wash(ctx,x-w*.02,y-h*.006,w*.095,h*.045,"rgba(172,186,183,.25)");
  for (let i=0;i<9;i++) {
    const xx = x + (random(i+27)-.5)*w*.21;
    const yy = y + (random(i+12)-.5)*h*.068;
    const span = w*(.012+random(i+9)*.035);
    const movement = Math.sin(t*.00022+i)*w*.002;
    stroke(ctx,[[xx-span+movement,yy],[xx,yy+.5],[xx+span+movement,yy]], seed+i, .7,.35);
  }
  for(let i=0;i<3;i++) {
    const progress = (t*.000035+i/3)%1;
    ctx.save(); ctx.globalAlpha *= (1-progress)*.13;
    ctx.strokeStyle=INK; ctx.lineWidth=.6; ctx.beginPath();
    ctx.ellipse(x-w*.035,y-h*.01,progress*w*.055+2,progress*h*.014+1,0,0,Math.PI*2); ctx.stroke();ctx.restore();
  }
}

function reeds(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, seed: number) {
  for (let i=0;i<24;i++) {
    const xx = x + (random(i+18)-.5)*s*60;
    const yy = y + (random(i+52)-.5)*s*15;
    const length = s*(13+random(i+93)*38);
    const lean = Math.sin(t*.00030+i*.43)*s*3;
    stroke(ctx,[[xx,yy],[xx+lean*.35,yy-length*.5],[xx+lean-3*s,yy-length]],seed+i,.7,.52);
    if(i%4===0) stroke(ctx,[[xx+lean-3*s,yy-length],[xx+lean-5*s,yy-length-6*s]],seed+i,2,.5);
  }
}

export function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number, place: Place) {
  const s = w / 1280;
  ctx.save();
  // Distant contours never close: the scenery dissolves into unpainted paper.
  wash(ctx,w*.53,h*.43,w*.27,h*.063,"rgba(111,127,128,.045)");
  for(let layer=0;layer<2;layer++) {
    const points: Point[] = Array.from({length:27},(_,i)=>[w*(.16+i*.028),h*(.42+layer*.035-Math.sin(i*.63+layer)*.022-random(i+layer*6)*.014)]);
    stroke(ctx,points,seed+layer, .7,.12);
  }
  tree(ctx,w*.245,h*.68,s*.87,t,seed);
  wash(ctx,w*.81,h*.553,w*.069,h*.026,"rgba(128,116,93,.14)");
  cottage(ctx,w*.81,h*.55,s*.94,seed+22,place==="lamplight",t);
  bench(ctx,w*.705,h*.74,s*.86,seed+31);
  for(let i=0;i<5;i++) {
    const x=w*(.862+i*.012),y=h*(.576-i*.002);
    stroke(ctx,[[x,y],[x,y-h*.028]],seed+i,.65,.5);
    if(i<4) stroke(ctx,[[x,y-h*.017],[x+w*.012,y-h*.02]],seed+i+3,.65,.45);
  }
  if(place==="pond") {
    pond(ctx,w,h,t,seed);
    // A short wooden jetty and a willow identify the waterside independently of color.
    for(let i=0;i<6;i++) stroke(ctx,[[w*(.685+i*.009),h*.786],[w*(.693+i*.009),h*.809]],seed+i,.85,.6);
    stroke(ctx,[[w*.686,h*.786],[w*.738,h*.786]],seed,1,.5);
    tree(ctx,w*.889,h*.69,s*.53,t,seed+93);
    for(let i=0;i<11;i++) {
      const x=w*(.86+i*.005),y=h*(.60+random(i)*.018);
      const sway=Math.sin(t*.00023+i)*s*3;
      stroke(ctx,[[x,y],[x+sway,y+h*.025],[x+sway*.8-s*4,y+h*.055]],seed+i,.65,.33);
    }
  }
  else {
    wash(ctx,w*.795,h*.785,w*.10,h*.06,"rgba(116,109,85,.12)");
    reeds(ctx,w*.83,h*.79,s*1.3,t,seed);
  }
  reeds(ctx,w*.18,h*.82,s,t,seed+90);
  reeds(ctx,w*.69,h*.86,s*.85,t,seed+120);
  if(place==="field") {
    const x=w*.58,y=h*.83;
    stroke(ctx,[[x,y],[x,y-h*.057]],seed,1);
    ctx.fillStyle="rgba(123,88,78,.17)";ctx.fillRect(x-w*.012,y-h*.076,w*.027,h*.026);
    stroke(ctx,[[x-w*.012,y-h*.05],[x-w*.012,y-h*.076],[x+w*.014,y-h*.076],[x+w*.014,y-h*.05],[x-w*.012,y-h*.05]],seed+9,.9);
    stroke(ctx,[[x-w*.006,y-h*.068],[x+w*.008,y-h*.068]],seed+7,.6);
  }
  if(place==="lamplight") {
    const x=w*.73,y=h*.65;
    stroke(ctx,[[x,y],[x,y-h*.11],[x+w*.022,y-h*.12]],seed,1.2);
    wash(ctx,x+w*.02,y-h*.108,w*.016,h*.033,"rgba(197,153,67,.22)");
    stroke(ctx,[[x+w*.012,y-h*.115],[x+w*.03,y-h*.115],[x+w*.027,y-h*.093],[x+w*.015,y-h*.093],[x+w*.012,y-h*.115]],seed+4,.85);
    for(let i=0;i<7;i++) {
      ctx.fillStyle=`rgba(172,140,67,${.12+Math.sin(t*.0008+i)*.09})`;
      ctx.beginPath();ctx.arc(w*(.72+random(i+33)*.16)+Math.sin(t*.00013+i)*3,h*(.67+random(i+23)*.14)+Math.cos(t*.00017+i)*2,1.1*s,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.restore();
}

export function keepsakePosition(entry: JournalEntry, index: number): Point {
  if (entry.form === "bird") return [.36 + (index % 5)*.105, .29 + (index%3)*.046];
  if (entry.form === "flower") return [.39 + (index % 5)*.085, .87 + (index%2)*.035];
  return [.67 + (index % 4)*.067, .66 + (index%3)*.066];
}

export function drawKeepsakes(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number, entries: JournalEntry[], selectedId?: string, age = 10000) {
  const s = w/1280;
  entries.slice(0,12).forEach((entry,i)=>{
    const [px,py]=keepsakePosition(entry,i);
    const selected = entry.id===selectedId;
    const reveal = selected ? Math.min(1,age/2000) : 1;
    const assemble = reveal*reveal*(3-2*reveal);
    ctx.save();
    ctx.translate(w*px+Math.sin(t*.00018+i)*s*2,h*py+Math.cos(t*.00021+i)*s*1.6);
    ctx.scale(s,s);
    ctx.globalAlpha *= .86 * reveal;
    const letters = Array.from(entry.text.replace(/\s/g,""));
    ctx.font=`15px ${HAND}`;ctx.textAlign="center";ctx.textBaseline="middle";
    if(entry.form==="bird") {
      const wing = Math.sin(t*.00048+i)*4;
      stroke(ctx,[[-27,4],[-10,-4],[8,-3],[24,0],[31,-4]],seed+i,.9);
      stroke(ctx,[[-8,-3],[-21,-20-wing],[0,-10],[12,-27+wing],[10,-1]],seed+i+7,.8);
      stroke(ctx,[[-26,4],[-37,14],[-33,1]],seed+i+11,.65);
      for(let g=0;g<7;g++) {
        ctx.save();ctx.translate((-21+g*7)*assemble+(1-assemble)*(g-3)*24,Math.sin(g*.7)*4+(1-assemble)*(-35-g*3));
        ctx.rotate((g-3)*.09);ctx.fillStyle="rgba(39,34,30,.65)";ctx.fillText(letters[g%letters.length],0,0);ctx.restore();
      }
    } else if(entry.form==="flower") {
      for(let g=0;g<5;g++) {
        const x=(g-2)*10, height=23+random(g+i*7)*21, sway=Math.sin(t*.0003+g)*2;
        stroke(ctx,[[x,4],[x+sway,-height]],seed+g,.7);
        stroke(ctx,[[x,-11],[x+8,-18]],seed+g+9,.6,.6);
        ctx.save();ctx.translate(x+sway,-height-(1-assemble)*30);ctx.rotate(Math.sin(t*.0003+g)*.09);ctx.fillStyle=g%2?"rgba(127,81,75,.75)":"rgba(103,96,65,.74)";ctx.fillText(letters[g%letters.length],0,0);ctx.restore();
      }
    } else {
      wash(ctx,0,-16,26,31,"rgba(191,147,77,.18)");
      stroke(ctx,[[-10,-31],[10,-31],[8,-5],[-8,-5],[-10,-31]],seed+i,.8);
      stroke(ctx,[[-5,-32],[0,-39],[5,-32]],seed+i+9,.7);
      ctx.fillStyle="rgba(112,84,41,.70)";ctx.fillText(letters[0],0,-18-(1-assemble)*30);
      stroke(ctx,[[0,-4],[0,11]],seed+i,.55,.35);
    }
    if(selected) {
      ctx.strokeStyle="rgba(69,67,60,.24)";ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(0,13,18,3,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  });
}
