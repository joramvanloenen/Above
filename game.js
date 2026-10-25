/* ABOVE — a touch-first, self-contained pixel-art sheep-herding adventure.
   All pixels and sounds are generated at runtime; no external assets required. */
(() => {
  "use strict";

  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d", { alpha: false });
  const action = document.getElementById("action");
  const actionIcon = document.getElementById("action-icon");
  const actionLabel = action.querySelector(".button-label");
  const switchButton = document.getElementById("switch");
  const switchText = switchButton.querySelector(".switch-text");
  const swordIconMarkup = actionIcon.innerHTML;
  const dogIconMarkup = '<path d="M10 29c1-8 5-13 14-13s13 5 14 13c-2 7-7 11-14 11S12 36 10 29Z" fill="currentColor"/><path d="M12 19 7 7c9 1 13 5 15 11M36 19l5-12c-9 1-13 5-15 11" fill="currentColor"/><path d="M18 28h1m10 0h1" stroke="#443753" stroke-width="3"/><path d="m22 34 2 2 2-2" stroke="#443753" stroke-width="2" fill="none"/>';
  const collectedLabel = document.getElementById("collected");
  const notice = document.getElementById("notice");
  const noticeTitle = document.getElementById("notice-title");
  const noticeCopy = document.getElementById("notice-copy");
  const hint = document.getElementById("hint");
  const game = document.getElementById("game");
  const SCALE = 3;
  const W = 1900, H = 1510, GOAL = 8;
  const HOME = { x: 684, y: 706, r: 34 };
  const PAL = {
    grass: "#a5af73", grassAlt: "#aab579", moss: "#829e79",
    deep: "#392b54", ink: "#423354", violet: "#60416b",
    leaf: "#397987", leafHi: "#498b91", leafBright: "#579596",
    cream: "#f0ecdb", ivory: "#d9d6c6", lavender: "#ac829a",
    earth: "#957d7e", stone: "#c7bbae", gold: "#e1c88c"
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const sq = v => v * v;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pix = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const makeCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  function seeded(seed) {
    let n = seed >>> 0;
    return () => {
      n += 0x6D2B79F5;
      let t = n;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const mapRand = seeded(493);
  const rbetween = (lo, hi) => lo + (hi - lo) * mapRand();
  const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  function duskWeight(x,y){
    const dx=(x-1450)/290,dy=(y-340)/215;
    return 1-smoothstep(.5,1.18,dx*dx+dy*dy);
  }
  const pathSegments = [
    [684,706,684,940], [684,706,905,825], [684,706,470,505],
    [905,825,1150,1025], [470,505,315,350], [905,825,1125,515]
  ];
  function pointSegmentDistance(x, y, seg) {
    const [ax,ay,bx,by] = seg, dx=bx-ax, dy=by-ay;
    const t = clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);
    return Math.hypot(x-(ax+dx*t), y-(ay+dy*t));
  }
  const glades = [
    [684,752,146,184], [905,820,110,95], [470,503,104,105],
    [1150,1025,112,85], [1125,515,86,74], [315,350,85,80],
    [1490,920,90,70], [1460,340,91,90]
  ];
  function meadowWeight(x,y) {
    let result=0;
    for(const [cx,cy,rx,ry] of glades){
      const d=sq((x-cx)/rx)+sq((y-cy)/ry);
      result=Math.max(result,1-smoothstep(.45,1.35,d));
    }
    for(const seg of pathSegments){
      result=Math.max(result,1-smoothstep(18,49,pointSegmentDistance(x,y,seg)));
    }
    return result;
  }

  let screenW=0,screenH=0,camX=0,camY=0,time=0,last=0;
  let barkTime=-10, noticeTimer=0, ringGlow=0, win=false, homed=0;
  // The knight starts under player control; both characters always exist in the world.
  const player={x:680,y:821,angle:-Math.PI/2,face:"up",step:0,speed:74,moving:0};
  const dog={x:668,y:839,angle:-Math.PI/2,face:"up",step:0,speed:83,moving:0};
  let controlled="knight";
  const activeActor=()=>controlled==="knight"?player:dog;
  const sword={active:false,step:0,elapsed:0,duration:0,queued:false,hit:false,lastFinish:-10};
  const COMBO_DURATIONS=[.29,.33,.53];
  const obstacles=[];
  let currentInput=null;
  const trees=[],sheep=[],stones=[],moths=[],particles=[],flowers=[],relics=[];
  const crownSprites=[],sheepSprites={};
  let dogSprites={},knightSprites={};
  let bg=null, audio=null;

  function resize() {
    screenW = Math.max(105,Math.ceil(innerWidth / SCALE));
    screenH = Math.max(105,Math.ceil(innerHeight / SCALE));
    canvas.width=screenW; canvas.height=screenH;
    ctx.imageSmoothingEnabled=false;
    const focus=activeActor();
    camX=clamp(focus.x-screenW/2,0,W-screenW);
    camY=clamp(focus.y-screenH/2,0,H-screenH);
  }

  function noisePatch(g,cx,cy,rx,ry,col,opacity=1) {
    g.fillStyle=col; g.globalAlpha=opacity;
    const minX=Math.floor(cx-rx),maxX=Math.ceil(cx+rx);
    const minY=Math.floor(cy-ry),maxY=Math.ceil(cy+ry);
    for(let y=minY;y<maxY;y+=4){
      for(let x=minX;x<maxX;x+=4){
        const nx=(x-cx)/rx,ny=(y-cy)/ry;
        if(nx*nx+ny*ny < .8 + .25*(mapRand()-.5) && mapRand()>.17){
          g.fillRect(x,y,4,4);
        }
      }
    }
    g.globalAlpha=1;
  }

  function makeGround() {
    bg=makeCanvas(W,H);
    const g=bg.getContext("2d");
    g.imageSmoothingEnabled=false;
    g.fillStyle=PAL.grass; g.fillRect(0,0,W,H);
    for(let i=0;i<150;i++){
      const x=rbetween(0,W),y=rbetween(0,H);
      const color=["#a7b578","#adb779","#9cae73","#a1ad77","#a8ad73","#a9b37c"][Math.floor(mapRand()*6)];
      noisePatch(g,x,y,rbetween(22,105),rbetween(15,72),color,.7);
    }
    // Faint trails join natural clearings; keep them mossy rather than drawing roads.
    for(const seg of pathSegments){
      const [ax,ay,bx,by]=seg;
      const steps=Math.ceil(Math.hypot(bx-ax,by-ay)/7);
      for(let i=0;i<=steps;i++){
        const t=i/steps, x=lerp(ax,bx,t),y=lerp(ay,by,t);
        if(i%3===0)noisePatch(g,x+rbetween(-7,7),y+rbetween(-7,7),rbetween(7,14),rbetween(5,10),"#b2b984",.36);
      }
    }
    // A distant, lilac-coloured forest echoes the twilight sequence in the references.
    for(let y=120;y<565;y+=2)for(let x=1110;x<1770;x+=2){
      const w=duskWeight(x,y);
      if(w>0 && mapRand()<w*.98){
        const p=mapRand();
        pix(g,x,y,2,2,p<.19?"#9d8487":p<.83?"#957e81":"#927a80");
      }
    }
    for(let i=0;i<11500;i++){
      const x=Math.floor(rbetween(3,W-3)),y=Math.floor(rbetween(3,H-3));
      const val=mapRand();
      if(val<.49)continue;
      const dusk=duskWeight(x,y)>.35;
      const color=dusk
        ? (val<.7?"#a18d91":val<.87?"#816f82":val<.96?"#c2a2a1":"#d9b39e")
        : (val<.65?"#88a77c":val<.81?"#849f83":val<.94?"#c0ba7d":"#e3ca88");
      const w=mapRand()<.23?1:2,h=mapRand()<.55?1:2;
      pix(g,x,y,w,h,color);
      if(mapRand()>.8)pix(g,x+4,y+1,2,1,color);
    }
    // Hand-dithered worn pink stone paving under the home circle.
    noisePatch(g,HOME.x,HOME.y,42,33,"#b0aa83",.6);
    noisePatch(g,HOME.x,HOME.y,32,24,"#b9ad89",.42);
    for(let a=0;a<TAU;a+=.13){
      const xx=HOME.x+Math.cos(a)*38,yy=HOME.y+Math.sin(a)*29;
      if(mapRand()>.3)pix(g,xx,yy,2,2,"#c8bd88");
    }
    // A dark mossy pond in one remote glade.
    drawPond(g,1132,514);
    for(const relic of relics){
      if(relic.type==="shrine") drawShrineFloor(g,relic.x,relic.y);
    }
  }

  function drawPond(g,x,y) {
    noisePatch(g,x,y+2,27,16,"#8d9f79",1);
    for(let yy=-12;yy<=13;yy+=2)for(let xx=-24;xx<=24;xx+=2){
      const v=sq(xx/25)+sq(yy/14);
      if(v<.9+mapRand()*.13)pix(g,x+xx,y+yy,2,2,v>.72?"#597e83":"#426d7c");
    }
    for(let i=0;i<15;i++){
      const xx=x+rbetween(-22,22), yy=y+rbetween(-14,14);
      pix(g,xx,yy,mapRand()>.5?4:2,1,"#779d91");
    }
  }

  function drawShrineFloor(g,x,y){
    noisePatch(g,x,y,28,21,"#9c9c7b",.6);
    for(let a=0;a<TAU;a+=TAU/10){
      const px=x+Math.cos(a)*22,py=y+Math.sin(a)*13;
      pix(g,px,py,4,2,"#b4a893");
    }
  }

  function treeSpecies(x,y,dominant) {
    // Groups share a little character without turning into identical plantations.
    if(mapRand()<.4)return dominant;
    const r=mapRand();
    return r<.30?0:r<.51?1:r<.73?2:r<.88?3:4;
  }
  function plantTree(x,y,dominant) {
    const species=treeSpecies(x,y,dominant);
    const base=[1.0,1.08,1.15,.81,1.13][species];
    const size=base*rbetween(.78,1.28);
    trees.push({
      x,y,species,size,
      sprite:Math.floor(mapRand()*6),
      twilight:duskWeight(x,y)>.6,
      flip:mapRand()<.5,sway:mapRand()*TAU,
      trunkRadius:(species===2?5:species===3?3:4)*size
    });
  }
  function generateTrees() {
    // Cluster planting creates the dense, tangled woodland silhouettes in the reference.
    for(let c=0;c<145;c++){
      const x=rbetween(85,W-85),y=rbetween(115,H-100);
      const n=3+Math.floor(mapRand()*11);
      const dominant=Math.floor(mapRand()*5);
      for(let j=0;j<n;j++){
        const xx=x+rbetween(-39,39),yy=y+rbetween(-33,33);
        if(xx<15||xx>W-15||yy<30||yy>H-15)continue;
        if(meadowWeight(xx,yy)>.53)continue;
        plantTree(xx,yy,dominant);
      }
    }
    // Deliberate wooded borders frame the opening meadow.
    const borders=[[555,720,40],[814,704,43],[594,972,36],[853,939,40],[502,622,35],[770,525,35]];
    for(const [cx,cy,count] of borders){
      for(let i=0;i<count;i++){
        const x=cx+rbetween(-34,34),y=cy+rbetween(-75,75);
        if(meadowWeight(x,y)>.58)continue;
        plantTree(x,y,Math.floor(mapRand()*5));
      }
    }
    trees.sort((a,b)=>a.y-b.y);
    for(let i=0;i<230;i++){
      const x=rbetween(30,W-30),y=rbetween(30,H-30);
      if(meadowWeight(x,y)<.36)continue;
      flowers.push({x,y,type:Math.floor(mapRand()*4),phase:rbetween(0,TAU)});
    }
    for(let i=0;i<105;i++){
      const x=rbetween(30,W-30),y=rbetween(30,H-30);
      if(meadowWeight(x,y)<.30)continue;
      stones.push({x,y,size:rbetween(2,5),kind:Math.floor(mapRand()*3)});
    }
    relics.push({x:465,y:496,type:"shrine",found:false},
                {x:1148,y:1025,type:"shrine",found:false},
                {x:1454,y:340,type:"shrine",found:false});
    for(let i=0;i<23;i++){
      const x=rbetween(350,1190),y=rbetween(420,1100);
      moths.push({x,y,baseX:x,baseY:y,angle:rbetween(0,TAU),phase:rbetween(0,TAU)});
    }
  }

  // Five actual tree families, rather than one crown with recoloured noise.
  // All sprite origins share the same ground-foot position (48,94).
  function makeCrown(variant,dusk=false,species=0) {
    const c=makeCanvas(96,108),g=c.getContext("2d");
    const r=seeded(1509+variant*47+species*4711+(dusk?70001:0));
    const palettes=dusk
      ? [["#372850","#563b70","#674982","#816499","#9b7db0"],
         ["#35284e","#50396d","#655080","#786291","#9680a8"],
         ["#3d2c56","#60406d","#744e83","#89649b","#a187ae"]]
      : [["#34294f","#514065","#367887","#488b92","#6c9da1"],
         ["#352d4d","#4d405c","#417c7a","#52918e","#7ba69d"],
         ["#392d50","#604260","#3f748e","#4e859c","#79a4a5"]];
    const [dark,shadow,leaf,light,highlight]=palettes[variant%3];
    const lobes=[];
    let trunkY=46;
    // Shape grammar: clustered oak, tiered conifer, broad flat canopy,
    // low multi-crown coppice, and hanging willow.
    if(species===0){
      lobes.push([48,33,25,23],[25,39,17,21],[70,43,19,21],
        [40,17,20,15],[62,20,18,15],[30,57,15,15],[61,57,20,15]);
      trunkY=43;
    }else if(species===1){
      trunkY=22;
      // A slim, asymmetrical, tapering evergreen with stepped branch skirts.
      for(let tier=0;tier<6;tier++){
        const y=15+tier*10,wide=8+tier*3.7;
        lobes.push([48+(r()-.5)*4,y,wide,11],[48+(r()-.5)*5,y+5,wide*.90,8]);
      }
    }else if(species===2){
      trunkY=40;
      lobes.push([23,36,20,18],[42,21,24,19],[69,35,23,19],
        [48,42,24,20],[14,48,13,14],[79,48,13,15],
        [33,53,22,14],[65,54,19,13]);
    }else if(species===3){
      trunkY=58;
      lobes.push([27,65,21,16],[46,49,19,19],[65,64,24,16],
        [35,59,20,19],[56,56,19,18],[18,73,13,11],[78,74,12,10]);
    }else{
      trunkY=34;
      lobes.push([48,23,22,19],[31,37,22,18],[63,37,22,18],
        [46,43,27,21],[26,57,17,22],[70,59,16,22],[48,55,21,19]);
    }
    // Shift individual clumps around in BOTH axes: not merely recolouring.
    for(const l of lobes){
      l[0]+=(r()-.5)*(species===1?3:11);
      l[1]+=(r()-.5)*7;
      l[2]*=.86+r()*.27;
      l[3]*=.86+r()*.28;
    }
    // Stippled flattened shadow; crooked/forked trunks remain visible beneath foliage.
    pix(g,26,97,46,3,dusk?"#88777e":"#849c7b");
    pix(g,32,100,32,2,dusk?"#958587":"#94a783");
    const trunkWidth=species===3?4:species===1?5:7;
    pix(g,48-trunkWidth/2,trunkY,trunkWidth,95-trunkY,dark);
    pix(g,48,trunkY+9,2,86-trunkY,"#765369");
    if(species===2||species===0){
      for(let i=0;i<15;i++){
        const x=46-i*.85,y=65-i*.9;
        pix(g,x,y,3,2,dark);
      }
      for(let i=0;i<16;i++)pix(g,50+i*.7,62-i,3,2,shadow);
    }else if(species===3){
      for(let i=0;i<13;i++){
        pix(g,47-i*.75,85-i*.95,2,2,dark);
        pix(g,50+i*.7,85-i*1.1,2,2,shadow);
      }
    }else if(species===4){
      for(let i=0;i<18;i++)pix(g,48-i*.6,67-i*1.2,2,2,dark);
    }
    const mask=new Uint8Array(96*108);
    for(let y=4;y<89;y++)for(let x=2;x<94;x++){
      let inside=false;
      for(const [cx,cy,rx,ry] of lobes){
        const dx=(x-cx)/rx,dy=(y-cy)/ry;
        if(dx*dx+dy*dy<1){inside=true;break;}
      }
      // Not all crowns have the same ragged convex hull.
      if(inside && r()>.024)mask[y*96+x]=1;
    }
    // Willow fringe hangs below its central canopy; the tip lengths vary.
    if(species===4){
      for(let i=0;i<26;i++){
        const x=Math.floor(16+r()*65),y=Math.floor(38+r()*12);
        const len=Math.floor(13+r()*25);
        for(let j=0;j<len;j++){
          const xx=x+Math.floor(Math.sin(j/6+i)*1.3),yy=y+j;
          if(xx>=2&&xx<94&&yy<91 && (j<5||r()>.22))mask[yy*96+xx]=1;
        }
      }
    }
    // Conifers have clear stepped shoulders.
    for(let y=5;y<91;y++)for(let x=2;x<94;x++){
      if(!mask[y*96+x])continue;
      const edge=!mask[(y-2)*96+x]||!mask[(y+2)*96+x]||!mask[y*96+x-2]||!mask[y*96+x+2];
      const v=r();
      const band=(Math.floor(x/6)+Math.floor(y/5)+variant)%7;
      let col;
      if(edge || (y>68 && v<.55))col=dark;
      else if(v<.11 || (band===0&&v<.50))col=shadow;
      else if(v>.87 && y<65)col=highlight;
      else if(v>.47)col=light;
      else col=leaf;
      pix(g,x,y,1,1,col);
    }
    // Leaf clusters have directional strokes. Short upward flecks on pines,
    // flat branch contours on spreading trees, long downward strands on willows.
    const marks=species===1?155:species===3?95:170;
    for(let i=0;i<marks;i++){
      const x=3+Math.floor(r()*90),y=9+Math.floor(r()*74);
      if(!mask[y*96+x])continue;
      const len=2+Math.floor(r()*(species===4?9:7));
      const shade=r()>.84?highlight:r()>.45?dark:shadow;
      for(let k=0;k<len;k++){
        const xx=species===1?x+Math.floor(k*.3):species===4?x+Math.floor(Math.sin(k*.7+i)*1.3):x+k;
        const yy=species===1?y-k:species===4?y+k:y+Math.floor(Math.sin(k*.85+i)*1.2);
        if(xx>=2&&xx<94&&yy>=4&&yy<91&&mask[yy*96+xx])pix(g,xx,yy,1,1,shade);
      }
      if(species===0||species===2)if(r()>.65)pix(g,x+2,y+2,2,1,shadow);
    }
    for(let i=0;i<12;i++){
      const x=10+Math.floor(r()*74),y=9+Math.floor(r()*62);
      if(mask[y*96+x])pix(g,x,y,r()>.5?2:1,2,highlight);
    }
    return c;
  }
  function buildTreeSprites(){
    for(let species=0;species<5;species++){
      for(let dusk=0;dusk<2;dusk++){
        for(let variant=0;variant<6;variant++){
          crownSprites.push(makeCrown(variant,!!dusk,species));
        }
      }
    }
  }

  function drawStone(g,x,y,size=3,kind=0){
    pix(g,x-size-1,y+1,size*2+3,2,"#849d79");
    pix(g,x-size,y-2,size*2,4,kind===1?"#bbaab1":"#d6cebe");
    pix(g,x-size+2,y-3,size,1,"#eee6d0");
    pix(g,x+size-2,y+1,2,2,PAL.violet);
  }
  function drawFlower(g,f){
    if(f.type===0){pix(g,f.x,f.y,2,2,"#d5c98d");pix(g,f.x+2,f.y,1,1,"#f0d9a2");}
    else if(f.type===1){pix(g,f.x,f.y,1,3,"#699a7e");pix(g,f.x+1,f.y-1,2,2,"#ded0c4");}
    else if(f.type===2){pix(g,f.x,f.y,2,1,"#698f7f");pix(g,f.x+3,f.y+1,2,1,"#7b997d");}
    else {pix(g,f.x,f.y,2,1,"#d2bd8b");pix(g,f.x+2,f.y+1,1,1,"#dfca91");}
  }
  function drawHome(g){
    const x=HOME.x,y=HOME.y;
    // Ring viewed at a shallow overhead angle: elliptical ground, asymmetric stones.
    g.fillStyle="#a3ab7a";g.beginPath();g.ellipse(x,y,31,22,0,0,TAU);g.fill();
    g.fillStyle="#b4b18b";g.beginPath();g.ellipse(x,y,26,17,0,0,TAU);g.fill();
    g.fillStyle="#aca684";g.beginPath();g.ellipse(x,y,20,12,0,0,TAU);g.fill();
    for(let i=0;i<17;i++){
      const a=i/17*TAU+.18;
      const px=x+Math.cos(a)*33, py=y+Math.sin(a)*22;
      if(i%7===0)continue;drawStone(g,px,py,2+(i%3===0),i%5===0?1:0);
    }
    // A little old flag makes the landmark identifiable without an intrusive waypoint UI.
    pix(g,x-2,y-13,1,11,PAL.deep);
    pix(g,x-1,y-13,7,5,"#b27f9b");pix(g,x+4,y-10,2,2,"#e5d19d");
    pix(g,x-6,y+5,4,2,"#dbd2bf");
    pix(g,x+9,y+7,2,2,"#d8d1bc");
    if(ringGlow>0){
      g.strokeStyle="#f5e6b5";g.lineWidth=1;g.globalAlpha=clamp(ringGlow,0,1)*.55;
      g.beginPath();g.ellipse(x,y,35+ringGlow*2,24+ringGlow,0,0,TAU);g.stroke();
      g.globalAlpha=1;
    }
  }
  function drawShrine(g,relic){
    const x=relic.x,y=relic.y;
    pix(g,x-9,y+4,22,3,"#7e9680");
    pix(g,x-5,y-14,11,18,PAL.violet);
    pix(g,x-6,y-15,13,3,"#b0a0a6");
    pix(g,x-3,y-12,6,10,"#b696a5");
    pix(g,x-1,y-8,2,6,relic.found?"#f0dfad":"#684268");
    pix(g,x-7,y+1,15,2,PAL.deep);
  }
  function buildSheepSprite(direction,frame,spot) {
    const c=makeCanvas(18,17),g=c.getContext("2d");
    const side=direction==="left"||direction==="right";
    const back=direction==="up";
    const wool=spot?"#e3decb":"#f0eee0";
    pix(g,3,13,13,2,"#829a78");
    const bounce=frame?0:1;
    pix(g,4,10+bounce,2,4,PAL.deep);
    pix(g,11,10+bounce,2,4,PAL.deep);
    if(side){
      const flip=direction==="left";
      g.save();if(flip){g.translate(18,0);g.scale(-1,1);}
      pix(g,2,5+bounce,12,8,PAL.deep);
      pix(g,2,4+bounce,11,7,wool);
      pix(g,4,3+bounce,9,3,"#faf5e6");
      pix(g,1,6+bounce,3,4,"#d7d6c9");
      pix(g,12,5+bounce,5,5,"#e3dfd3");
      pix(g,14,7+bounce,3,2,PAL.deep);
      pix(g,14,5+bounce,2,1,"#473751");
      pix(g,6,9+bounce,3,2,"#c4c2ba");
      g.restore();
    }else{
      pix(g,3,4+bounce,12,10,PAL.deep);
      pix(g,4,3+bounce,10,9,wool);
      pix(g,5,2+bounce,8,4,"#f8f3e3");
      pix(g,3,5+bounce,3,5,"#e8e4d7");
      pix(g,12,6+bounce,3,5,"#d8d5c8");
      if(!back){
        pix(g,5,8+bounce,8,5,"#d8d4c9");
        pix(g,6,10+bounce,2,1,PAL.deep);
        pix(g,11,10+bounce,2,1,PAL.deep);
        pix(g,8,12+bounce,2,2,"#8c7b80");
      }else pix(g,6,5+bounce,5,2,"#cbc8bd");
    }
    return c;
  }
  function buildSheepSprites(){
    for(const dir of ["left","right","up","down"])
      for(let fr=0;fr<2;fr++)
        for(let spot=0;spot<2;spot++)
          sheepSprites[dir+fr+spot]=buildSheepSprite(dir,fr,spot);
  }
  function buildDogSprite(dir,fr){
    const c=makeCanvas(20,19),g=c.getContext("2d"),b=fr?0:1;
    pix(g,2,15,17,2,"#7f997b");
    if(dir==="left"||dir==="right"){
      g.save();if(dir==="left"){g.translate(20,0);g.scale(-1,1);}
      pix(g,2,8+b,3,3,"#e5d8bc");pix(g,1,6+b,3,3,"#b6b2ab");
      pix(g,4,6+b,11,9,PAL.deep);
      pix(g,6,4+b,9,9,"#e4ddce");
      pix(g,8,5+b,5,5,"#a69e9e");
      pix(g,12,3+b,5,8,"#eee8d8");
      pix(g,13,2+b,2,4,PAL.deep);pix(g,17,7+b,2,3,"#d5d0c7");
      pix(g,17,8+b,2,2,PAL.deep);pix(g,15,6+b,1,1,PAL.deep);
      pix(g,6,13+b,3,3,PAL.deep);pix(g,13,12+b,3,4,PAL.deep);
      g.restore();
    }else{
      pix(g,6,6+b,9,10,PAL.deep);
      pix(g,7,5+b,8,9,"#e6dfd0");
      pix(g,5,4+b,3,6,PAL.deep);pix(g,14,4+b,3,6,PAL.deep);
      pix(g,7,3+b,8,8,"#e9e4d8");
      pix(g,8,7+b,5,5,"#b8adad");
      pix(g,7,14+b,3,2,PAL.deep);pix(g,13,14+b,3,2,PAL.deep);
      if(dir==="down"){
        pix(g,8,7+b,1,2,PAL.deep);pix(g,13,7+b,1,2,PAL.deep);
        pix(g,10,10+b,2,2,PAL.deep);
      }else{pix(g,10,4+b,3,3,"#b5aeb0");pix(g,4,11+b,3,3,"#ebe0cc");}
    }
    return c;
  }
  function buildDogSprites(){
    for(const dir of ["left","right","up","down"])for(let fr=0;fr<2;fr++)dogSprites[dir+fr]=buildDogSprite(dir,fr);
  }

  function buildKnightSprite(direction,frame){
    const c=makeCanvas(24,29),g=c.getContext("2d"),b=frame?0:1;
    const front=direction==="down",back=direction==="up";
    const iron="#b8c9cb",shine="#edf0e4",steel="#718991",dark="#3d344e";
    const blue="#496a82",deepBlue="#39536d",gold="#dfbd81",cape="#8c637b";
    // Staggered boots and a little cape make the upright, slightly tilted sprite readable.
    pix(g,5,25,15,2,"#849b7a");
    pix(g,6,19+b,5,7,dark);pix(g,13,19+(1-b),5,7,dark);
    pix(g,6,23+b,5,2,"#b1a1a2");pix(g,13,23+(1-b),5,2,"#b1a1a2");
    pix(g,4,10+b,17,12,dark);
    pix(g,5,9+b,15,12,cape);
    pix(g,7,10+b,11,12,blue);
    pix(g,9,12+b,6,8,deepBlue);
    pix(g,11,13+b,2,6,gold);
    pix(g,5,9+b,4,9,steel);pix(g,17,9+b,4,9,iron);
    pix(g,4,13+b,3,5,dark);pix(g,19,13+b,3,5,dark);
    pix(g,7,4+b,11,9,dark);
    pix(g,8,3+b,9,9,iron);
    pix(g,9,4+b,7,2,shine);
    if(back){
      pix(g,9,5+b,7,6,steel);
      pix(g,11,2+b,4,3,cape);
      pix(g,9,12+b,6,3,deepBlue);
    }else{
      pix(g,9,8+b,7,3,dark);
      pix(g,10,8+b,5,1,gold);
      pix(g,11,2+b,4,3,cape);
      if(front) {
        pix(g,10,9+b,2,1,shine);pix(g,14,9+b,2,1,shine);
      }else if(direction==="left"){
        pix(g,8,9+b,2,2,shine);
        pix(g,17,6+b,2,5,steel);
      }else{
        pix(g,16,9+b,2,2,shine);
        pix(g,6,6+b,2,5,steel);
      }
    }
    // Sheathed short sword visible on the hip at rest.
    pix(g,direction==="left"?19:3,17+b,2,8,dark);
    pix(g,direction==="left"?19:3,17+b,2,5,gold);
    return c;
  }
  function buildKnightSprites(){
    for(const dir of ["left","right","up","down"])
      for(let frame=0;frame<2;frame++)knightSprites[dir+frame]=buildKnightSprite(dir,frame);
  }

  function spawnFlock(cx,cy,n,id){
    for(let i=0;i<n;i++){
      const a=i*2.39996,d=4+Math.sqrt(i)*6;
      const x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;
      sheep.push({x,y,vx:0,vy:0,group:id,dir:"right",phase:rbetween(0,TAU),
        wander:rbetween(0,TAU),clock:rbetween(.5,2.2),panic:0,spot:i%4===0,
        home:false,pace:rbetween(.83,1.2),bravery:rbetween(.84,1.23),
        state:i%4===0?"walk":"graze",stateTimer:rbetween(.6,3),
        fleeX:0,fleeY:0,motion:0});
    }
  }
  function spawnTargets(){
    // Harmless practice dummies and thorn patches give the sword real hit feedback.
    for(const [x,y,type] of [
      [680,786,"bramble"],[718,866,"dummy"],[886,812,"bramble"],
      [461,481,"dummy"],[1156,995,"bramble"],[1131,537,"bramble"],
      [1460,343,"dummy"],[810,1087,"bramble"],[544,612,"bramble"]
    ])obstacles.push({x,y,type,hp:type==="dummy"?999:3,flash:0,shake:0,broken:false,hitCount:0});
  }
  function spawnLife(){
    // The first flock is visible immediately, just beyond the dog.
    spawnFlock(702,790,7,0);
    spawnFlock(905,833,7,1);
    spawnFlock(468,521,6,2);
    spawnFlock(1144,1020,7,3);
    spawnFlock(1126,487,5,4);
  }
  function collideTrees(entity,radius){
    for(const t of trees){
      if(Math.abs(t.y-entity.y)>13||Math.abs(t.x-entity.x)>13)continue;
      const dx=entity.x-t.x,dy=entity.y-t.y;
      const min=radius+t.trunkRadius,d2=dx*dx+dy*dy;
      if(d2<min*min){
        const d=Math.max(.01,Math.sqrt(d2));
        entity.x+=dx/d*(min-d);entity.y+=dy/d*(min-d);
      }
    }
    entity.x=clamp(entity.x,15,W-15);entity.y=clamp(entity.y,15,H-15);
  }

  function addParticles(x,y,color,count,style="dot") {
    for(let i=0;i<count;i++){
      const angle=rand(0,TAU),speed=rand(6,28);
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-7,
        life:rand(.35,1),max:1,color,style});
    }
    if(particles.length>160)particles.splice(0,particles.length-160);
  }
  function showNotice(title,copy,seconds=5){
    notice.hidden=false;notice.classList.remove("fade");
    noticeTitle.textContent=title;noticeCopy.textContent=copy;
    noticeTimer=seconds;
  }
  function sound(kind){
    try{
      if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();
      if(audio.state==="suspended")audio.resume();
      const now=audio.currentTime;
      const osc=audio.createOscillator(),gain=audio.createGain();
      osc.type=kind==="bark"?"square":"sine";
      osc.frequency.setValueAtTime(kind==="bark"?210:700,now);
      osc.frequency.exponentialRampToValueAtTime(kind==="bark"?80:1100,now+(kind==="bark"?.18:.36));
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(kind==="bark"?.09:.048,now+.015);
      gain.gain.exponentialRampToValueAtTime(.0001,now+(kind==="bark"?.2:.38));
      osc.connect(gain);gain.connect(audio.destination);
      osc.start(now);osc.stop(now+(kind==="bark"?.22:.39));
    }catch(err){/* silent mode is fine */}
  }

  function doAction() {
    if(time-barkTime<.49)return;
    barkTime=time;
    action.classList.add("pressed");
    setTimeout(()=>action.classList.remove("pressed"),150);
    sound("bark");
    if(navigator.vibrate)navigator.vibrate(18);
    addParticles(player.x,player.y-7,"#f2e6ca",8);
    for(const s of sheep){
      if(s.home)continue;
      const dx=s.x-player.x,dy=s.y-player.y,d=Math.hypot(dx,dy);
      if(d<112){
        const power=1-d/125;
        const fx=dx/Math.max(1,d),fy=dy/Math.max(1,d);
        s.vx+=fx*power*42;
        s.vy+=fy*power*42;
        s.fleeX=fx;s.fleeY=fy;
        s.panic=Math.max(s.panic,2.1+power*1.2);
        s.state="flee";s.stateTimer=0;
      }
    }
    for(const relic of relics){
      if(!relic.found&&distance(relic,player)<21){
        relic.found=true;ringGlow=1;addParticles(relic.x,relic.y,"#e4c58d",24);
        sound("find");
        showNotice("AN OLD WIND CHIME","It remembers the path home. "+relics.filter(r=>r.found).length+" of 3 found.",5);
      }
    }
  }

  function updatePlayer(dt){
    let dx=0,dy=0,strength=0;
    if(currentInput){
      const ax=currentInput.x-currentInput.startX,ay=currentInput.y-currentInput.startY;
      const d=Math.hypot(ax,ay);
      if(d>7){strength=clamp((d-7)/35,0,1);dx=ax/d;dy=ay/d;}
    }
    player.moving=strength;
    if(strength>.04){
      const speed=player.speed*strength;
      player.x+=dx*speed*dt;player.y+=dy*speed*dt;
      player.angle=Math.atan2(dy,dx);
      if(Math.abs(dx)>Math.abs(dy)*.85)player.face=dx>0?"right":"left";
      else player.face=dy>0?"down":"up";
      player.step+=dt*16*strength;
      if(Math.random()<dt*3*strength)addParticles(player.x,player.y,"#bec08d",1);
    }
    collideTrees(player,4);
  }

  function updateSheep(dt) {
    for(let i=0;i<sheep.length;i++){
      const s=sheep[i];
      s.phase+=dt;
      if(s.home){
        s.state="graze";s.motion=0;
        s.vx*=Math.exp(-dt*4);s.vy*=Math.exp(-dt*4);
        s.x+=s.vx*dt;s.y+=s.vy*dt;
        const d=distance(s,HOME);
        if(d>27){
          s.x=lerp(s.x,HOME.x+(s.x-HOME.x)/d*23,dt*2);
          s.y=lerp(s.y,HOME.y+(s.y-HOME.y)/d*23,dt*2);
        }
        continue;
      }
      // Sheep have their own temperaments: cautious, restless or unhurried.
      s.clock-=dt;
      if(s.clock<=0){
        s.clock=rand(.7,2.2);
        s.wander+=rand(-1.2,1.2);
      }
      const dx=s.x-player.x,dy=s.y-player.y;
      const dogDist=Math.max(.001,Math.hypot(dx,dy));
      const danger=(player.moving>.23?53:36)/s.bravery;
      const aware=danger+28;
      if(dogDist<danger){
        const urgency=(danger-dogDist)/danger;
        s.panic=Math.max(s.panic,.95+urgency*1.4);
        s.fleeX=dx/dogDist;s.fleeY=dy/dogDist;
        s.state="flee";
      }else if(dogDist<aware && s.panic<.1 && s.state!=="alert"){
        // Sheep raise their heads and watch the approaching dog.
        s.state="alert";s.stateTimer=rand(.35,.8);
        s.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?"right":"left"):(dy<0?"down":"up");
      }
      let near=0,groupX=0,groupY=0,alignX=0,alignY=0;
      let sepX=0,sepY=0,alarmedNeighbor=null;
      for(let j=0;j<sheep.length;j++){
        if(i===j)continue;
        const o=sheep[j];
        const ox=o.x-s.x,oy=o.y-s.y,d2=ox*ox+oy*oy;
        if(d2<.01)continue;
        if(d2<14*14){
          const d=Math.sqrt(d2),force=(14-d)/d;
          sepX-=ox*force;sepY-=oy*force;
        }
        if(o.home||o.group!==s.group||d2>75*75)continue;
        near++;groupX+=o.x;groupY+=o.y;
        alignX+=o.vx;alignY+=o.vy;
        if(d2<28*28 && o.panic>1.25 && !alarmedNeighbor)alarmedNeighbor=o;
      }
      // A bolting animal can startle neighbours, producing a believable flock wave.
      if(s.panic<.06 && alarmedNeighbor && Math.random()<dt*1.7){
        s.panic=rand(.9,1.45);
        const d=Math.max(1,Math.hypot(s.x-alarmedNeighbor.x,s.y-alarmedNeighbor.y));
        s.fleeX=(s.x-alarmedNeighbor.x)/d*.35+alarmedNeighbor.fleeX*.65;
        s.fleeY=(s.y-alarmedNeighbor.y)/d*.35+alarmedNeighbor.fleeY*.65;
        s.state="flee";
      }
      s.panic=Math.max(0,s.panic-dt);
      s.stateTimer-=dt;
      if(s.panic<=0 && s.state==="flee"){
        // After flight, sheep slow to a trot and find the group again.
        s.state="walk";s.stateTimer=rand(1.3,2.8);
      }
      if(s.panic<=0 && s.stateTimer<=0){
        const roll=Math.random();
        if(s.state==="alert" || s.state==="graze"){
          s.state=roll<.72?"walk":"graze";
          s.stateTimer=s.state==="walk"?rand(1.1,3):rand(1.4,3.5);
        }else{
          s.state=roll<.64?"graze":roll<.92?"walk":"play";
          s.stateTimer=s.state==="graze"?rand(1.5,4):s.state==="play"?rand(.4,.95):rand(1.2,3.2);
          if(s.state==="play")s.wander+=rand(-1.1,1.1);
        }
      }
      let targetX=0,targetY=0,targetSpeed=0;
      if(s.panic>.02){
        s.state="flee";
        let fx=s.fleeX,fy=s.fleeY;
        if(dogDist<112){
          const dogWeight=clamp((112-dogDist)/65,.2,.9);
          fx=lerp(fx,dx/dogDist,dogWeight);
          fy=lerp(fy,dy/dogDist,dogWeight);
          s.fleeX=fx;s.fleeY=fy;
        }
        if(near){
          // Keep a little lateral flock coherence without cancelling the escape.
          fx+=(alignX/near)*.006;
          fy+=(alignY/near)*.006;
        }
        fx+=sepX*.15;fy+=sepY*.15;
        const mag=Math.max(.01,Math.hypot(fx,fy));
        targetSpeed=(s.panic>.55?67:38)*s.pace;
        targetX=fx/mag*targetSpeed;targetY=fy/mag*targetSpeed;
      }else if(s.state==="walk"||s.state==="play"){
        let wx=Math.cos(s.wander),wy=Math.sin(s.wander);
        if(near){
          const cx=groupX/near-s.x,cy=groupY/near-s.y;
          const d=Math.hypot(cx,cy);
          if(d>17){
            const cohesion=clamp((d-17)/35,0,.65);
            wx=lerp(wx,cx/d,cohesion);wy=lerp(wy,cy/d,cohesion);
          }
        }
        wx+=sepX*.16;wy+=sepY*.16;
        const mag=Math.max(.01,Math.hypot(wx,wy));
        targetSpeed=(s.state==="play"?30:19)*s.pace;
        targetX=wx/mag*targetSpeed;targetY=wy/mag*targetSpeed;
      }else if(s.state==="alert"){
        // Freeze briefly and assess the dog; resume browsing when safe.
        if(dogDist>aware+17)s.stateTimer=0;
      }
      // Smooth acceleration and deceleration, but let panic feel sudden and explosive.
      const response=s.panic>.02?8.5:targetSpeed?3.5:5.2;
      const blend=1-Math.exp(-dt*response);
      s.vx=lerp(s.vx,targetX,blend);
      s.vy=lerp(s.vy,targetY,blend);
      let speed=Math.hypot(s.vx,s.vy);
      const maxSpeed=78*s.pace;
      if(speed>maxSpeed){
        s.vx*=maxSpeed/speed;s.vy*=maxSpeed/speed;
        speed=maxSpeed;
      }
      const prevX=s.x,prevY=s.y;
      s.x+=s.vx*dt;s.y+=s.vy*dt;
      collideTrees(s,2.4);
      // A trunk blocks a sheep instead of silently absorbing it.
      if(Math.hypot(s.x-(prevX+s.vx*dt),s.y-(prevY+s.vy*dt))>.2){
        s.vx*=.55;s.vy*=.55;
        s.wander+=rand(-1.5,1.5);
      }
      s.motion=speed;
      if(speed>3){
        if(Math.abs(s.vx)>Math.abs(s.vy)*.75)s.dir=s.vx>0?"right":"left";
        else s.dir=s.vy>0?"down":"up";
      }
      if(s.panic>.3 && speed>32 && Math.random()<dt*4)
        addParticles(s.x,s.y,"#c5bd8f",1);
      // A sheep reaching the stone circle becomes safe and no longer flees.
      if(Math.hypot(s.x-HOME.x,(s.y-HOME.y)*1.35)<HOME.r-1){
        s.home=true;s.panic=0;homed++;ringGlow=1.4;
        addParticles(s.x,s.y-6,"#f1e6bb",15);
        sound("find");collectedLabel.textContent=Math.min(homed,GOAL);
        if(homed===1)showNotice("ONE LITTLE WANDERER","Keep the others moving toward the stone circle.",3.5);
        else if(homed===GOAL&&!win){
          win=true;game.classList.add("completed");
          showNotice("THE FLOCK IS HOME","The valley has grown quiet again. Explore the woods — there are still secrets here.",12);
          addParticles(HOME.x,HOME.y,"#f1dba7",45);
        }else if(homed===GOAL-1)showNotice("ALMOST THERE","Just one more sheep to bring home.",3.3);
      }
    }
  }

  function updateParticles(dt){
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];p.life-=dt;
      if(p.life<=0){particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      p.vy+=10*dt;p.vx*=Math.exp(-dt*1.1);
    }
    for(const m of moths){
      m.angle+=dt*(.6+Math.sin(m.phase)*.12);
      m.x=m.baseX+Math.cos(m.angle)*9;m.y=m.baseY+Math.sin(m.angle*.8)*7;
      m.phase+=dt*.48;
    }
    ringGlow=Math.max(0,ringGlow-dt*.8);
    if(noticeTimer>0){
      noticeTimer-=dt;
      if(noticeTimer<=0)notice.classList.add("fade");
    }
  }

  function drawBark(g){
    const age=time-barkTime;if(age<0||age>.55)return;
    const t=age/.55;
    g.strokeStyle="#fbedd4";g.globalAlpha=(1-t)*.65;
    g.lineWidth=1;
    for(let i=0;i<3;i++){
      const r=(12+i*11)+age*64;
      g.beginPath();g.ellipse(dog.x,dog.y-6,r,r*.65,0,0,TAU);g.stroke();
    }
    g.globalAlpha=1;
  }

  function drawTree(g,t){
    const sprite=crownSprites[t.species*12+(t.twilight?6:0)+t.sprite];
    const sway=Math.sin(time*.65+t.sway)>0.93?1:0;
    const w=Math.round(96*t.size),h=Math.round(108*t.size);
    g.drawImage(sprite,Math.round(t.x-w/2)+sway,Math.round(t.y-94*t.size),w,h);
  }
  function drawKnight(g){
    const fr=Math.floor(player.step)%2;
    const jolt=sword.active?Math.sin(sword.elapsed/sword.duration*Math.PI)*2:0;
    g.drawImage(knightSprites[player.face+fr],Math.round(player.x-12),Math.round(player.y-25+jolt));
    if(sword.active)drawSword(g);
  }
  function drawDog(g){
    const fr=Math.floor(dog.step)%2;
    g.drawImage(dogSprites[dog.face+fr],Math.round(dog.x-10),Math.round(dog.y-16));
    if(time-barkTime<.15){
      pix(g,dog.x+10,dog.y-15,2,2,"#f1e4cd");
      pix(g,dog.x+15,dog.y-19,3,2,"#f1e4cd");
    }
  }
  function drawSheep(g,s){
    const running=s.motion>30;
    const walking=s.motion>4;
    const fr=walking?Math.floor(s.phase*(running?15:7))%2:0;
    const nod=!walking&&s.state==="graze"&&Math.sin(s.phase*3)>.35?1:0;
    const hop=running&&Math.sin(s.phase*19)>.1?2:0;
    const key=s.dir+fr+(s.spot?1:0);
    g.drawImage(sheepSprites[key],Math.round(s.x-9),Math.round(s.y-14+nod-hop));
  }
  function drawMoths(g){
    for(const m of moths){
      if(m.x<camX-5||m.x>camX+screenW+5||m.y<camY-5||m.y>camY+screenH+5)continue;
      const wing=Math.sin(time*17+m.phase)>0;
      pix(g,m.x-2,m.y,wing?2:1,2,"#d8c2aa");
      pix(g,m.x+1,m.y-1,wing?2:1,2,"#e6d7b9");
      pix(g,m.x,m.y,1,2,PAL.deep);
    }
  }
  function drawParticles(g){
    for(const p of particles){
      g.globalAlpha=clamp(p.life/p.max,0,1);
      pix(g,p.x,p.y,p.style==="dot"?2:1,2,p.color);
    }
    g.globalAlpha=1;
  }

  function drawWorld(){
    // Snap camera to integer world pixels to preserve crisp, stable nearest-neighbour pixels.
    const cx=Math.round(camX),cy=Math.round(camY);
    ctx.fillStyle=PAL.grass;ctx.fillRect(0,0,screenW,screenH);
    const w=Math.min(screenW,W-cx),h=Math.min(screenH,H-cy);
    if(w>0&&h>0)ctx.drawImage(bg,cx,cy,w,h,0,0,w,h);
    ctx.save();ctx.translate(-cx,-cy);
    for(const f of flowers){
      if(f.x<cx-3||f.x>cx+screenW+3||f.y<cy-3||f.y>cy+screenH+3)continue;
      drawFlower(ctx,f);
    }
    drawHome(ctx);
    for(const rock of stones){
      if(rock.x<cx-9||rock.x>cx+screenW+9||rock.y<cy-9||rock.y>cy+screenH+9)continue;
      drawStone(ctx,rock.x,rock.y,Math.floor(rock.size),rock.kind);
    }
    // Sort trunks, sheep, dog and ancient standing stones by foot position.
    const actors=[];
    for(const t of trees){
      if(t.x<cx-110||t.x>cx+screenW+110||t.y<cy-25||t.y>cy+screenH+150)continue;
      actors.push({y:t.y,kind:0,object:t});
    }
    for(const s of sheep){
      if(s.x<cx-24||s.x>cx+screenW+24||s.y<cy-26||s.y>cy+screenH+24)continue;
      actors.push({y:s.y,kind:1,object:s});
    }
    for(const r of relics){
      if(r.x<cx-30||r.x>cx+screenW+30||r.y<cy-30||r.y>cy+screenH+30)continue;
      actors.push({y:r.y,kind:3,object:r});
    }
    for(const o of obstacles)if(o.x>cx-35&&o.x<cx+screenW+35&&o.y>cy-35&&o.y<cy+screenH+35)
      actors.push({y:o.y,kind:4,object:o});
    actors.push({y:player.y,kind:2,object:player});
    actors.push({y:dog.y,kind:5,object:dog});
    actors.sort((a,b)=>a.y-b.y);
    for(const a of actors){
      if(a.kind===0)drawTree(ctx,a.object);
      else if(a.kind===1)drawSheep(ctx,a.object);
      else if(a.kind===2)drawKnight(ctx);
      else if(a.kind===5)drawDog(ctx);
      else if(a.kind===4)drawObstacle(ctx,a.object);
      else drawShrine(ctx,a.object);
    }
    drawMoths(ctx);drawBark(ctx);drawParticles(ctx);
    ctx.restore();
  }

  function frame(timestamp){
    if(!last)last=timestamp;
    const dt=Math.min(.05,(timestamp-last)/1000);last=timestamp;time+=dt;
    updatePlayer(dt);updateSword(dt);updateSheep(dt);updateParticles(dt);updateActionLabel();
    const ease=1-Math.exp(-dt*4.5);
    const focus=activeActor();
    camX=clamp(lerp(camX,focus.x-screenW/2,ease),0,Math.max(0,W-screenW));
    camY=clamp(lerp(camY,focus.y-screenH/2,ease),0,Math.max(0,H-screenH));
    drawWorld();
    requestAnimationFrame(frame);
  }

  function setupInput(){
    game.addEventListener("pointerdown",e=>{
      if(e.target.closest("#action")||e.target.closest("#switch"))return;
      if(currentInput)return;
      currentInput={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY};
      if(e.cancelable)e.preventDefault();
      if(hint)hint.style.opacity="0";
    },{passive:false});
    window.addEventListener("pointermove",e=>{
      if(currentInput && e.pointerId===currentInput.id){
        currentInput.x=e.clientX;currentInput.y=e.clientY;
        if(e.cancelable)e.preventDefault();
      }
    },{passive:false});
    const release=e=>{if(currentInput&&e.pointerId===currentInput.id)currentInput=null;};
    window.addEventListener("pointerup",release);
    window.addEventListener("pointercancel",release);
    window.addEventListener("blur",()=>currentInput=null);
    switchButton.addEventListener("pointerdown",e=>e.stopPropagation());
    switchButton.addEventListener("click",e=>{e.stopPropagation();switchCharacter();});
    action.addEventListener("pointerdown",e=>e.stopPropagation());
    action.addEventListener("click",e=>{e.stopPropagation();doAction();});
    action.addEventListener("contextmenu",e=>e.preventDefault());
    document.addEventListener("contextmenu",e=>e.preventDefault());
  }

  function init(){
    resize();
    buildTreeSprites();buildSheepSprites();buildDogSprites();buildKnightSprites();
    generateTrees();makeGround();spawnLife();spawnTargets();
    setupInput();
    window.addEventListener("resize",resize);
    window.addEventListener("orientationchange",resize);
    document.addEventListener("visibilitychange",()=>{last=0;currentInput=null;});
    requestAnimationFrame(frame);
  }
  init();
})();