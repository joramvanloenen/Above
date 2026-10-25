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
  const weaponButton = document.getElementById("weapon");
  const weaponLabel = document.getElementById("weapon-name");
  const heartsLabel = document.getElementById("hearts");
  const areaLabel = document.getElementById("area-name");
  const bossBar = document.getElementById("boss-bar");
  const bossFill = document.getElementById("boss-fill");
  const switchText = switchButton.querySelector(".switch-text");
  const swordIconMarkup = actionIcon.innerHTML;
  const bowIconMarkup = '<path d="M7 7 Q37 24 7 41" stroke="currentColor" stroke-width="4" fill="none"/><path d="M7 7 28 24 7 41" stroke="#c9bc96" stroke-width="2" fill="none"/><path d="M14 24h28" stroke="#e5e9e1" stroke-width="4"/><path d="M35 18l7 6-7 6" stroke="#e4d1a7" stroke-width="3" fill="none"/>';
  const dogIconMarkup = '<path d="M10 29c1-8 5-13 14-13s13 5 14 13c-2 7-7 11-14 11S12 36 10 29Z" fill="currentColor"/><path d="M12 19 7 7c9 1 13 5 15 11M36 19l5-12c-9 1-13 5-15 11" fill="currentColor"/><path d="M18 28h1m10 0h1" stroke="#443753" stroke-width="3"/><path d="m22 34 2 2 2-2" stroke="#443753" stroke-width="2" fill="none"/>';
  const collectedLabel = document.getElementById("collected");
  const notice = document.getElementById("notice");
  const noticeTitle = document.getElementById("notice-title");
  const noticeCopy = document.getElementById("notice-copy");
  const hint = document.getElementById("hint");
  const game = document.getElementById("game");
  const damageFeedback = document.getElementById("damage-feedback");
  const SCALE = 3;
  const OBJECT_SCALE = .5; // Uniform scale for characters, enemies, vegetation and props.
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

  // The terrain and enemy ecology share the same stable, spatial biome map.
  // Meandering coordinate offsets prevent straight rectangular biome borders.
  const BIOMES={
    meadow:{label:"SUNLIT MEADOW",trees:.14,ground:["#a5b37b","#aab681","#9fab76"],enemy:"bandit",quota:12},
    forest:{label:"OLD GROWTH WOODS",trees:1,ground:["#819a77","#879e79","#7c9573"],enemy:"wolf",quota:16},
    mire:{label:"THE SINKING MIRE",trees:.04,ground:["#839078","#89947c","#7e8974"],enemy:"slime",quota:17},
    highlands:{label:"STONY HIGHLANDS",trees:.04,ground:["#b0aa86","#aaa784","#b4ad8b"],enemy:"golem",quota:12},
    twilight:{label:"TWILIGHT GROVE",trees:.46,ground:["#8e8b90","#918994","#8c8591"],enemy:"wisp",quota:14}
  };
  const biomeCenters=[
    ["meadow",700,760,710,650],["forest",285,300,640,620],
    ["mire",1490,1120,730,650],["highlands",665,1405,840,680],
    ["twilight",1460,315,770,650]
  ];
  function biomeAt(x,y){
    const wx=x+35*Math.sin(y*.009)+20*Math.sin((x+y)*.014);
    const wy=y+30*Math.sin(x*.008);
    let id="meadow",nearest=Infinity;
    for(const [name,cx,cy,rx,ry] of biomeCenters){
      const d=((wx-cx)/rx)**2+((wy-cy)/ry)**2;
      if(d<nearest){nearest=d;id=name;}
    }
    return id;
  }
  function biomeLabel(x,y){return BIOMES[biomeAt(x,y)].label;}
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
  let damageFlash=0;
  // The knight starts under player control; both characters always exist in the world.
  const player={x:680,y:821,angle:-Math.PI/2,face:"up",step:0,speed:74,moving:0};
  const dog={x:668,y:839,angle:-Math.PI/2,face:"up",step:0,speed:83,moving:0};
  let controlled="knight";
  const activeActor=()=>controlled==="knight"?player:dog;
  const sword={active:false,step:0,elapsed:0,duration:0,queued:0,hit:false,lastFinish:-10};
  // Faster attacks, without losing the weight of the finisher.
  const COMBO_DURATIONS=[.19,.21,.31];
  const COMBO_GRACE=.48;
  const obstacles=[];
  let weapon="sword",lastShot=-10,invincible=0,health=5,maxHealth=5;
  const enemies=[],bolts=[],tombs=[],mudPuddles=[];
  let underground=null,entranceReturn=null,transitionLock=0;
  let victoryNotice=false;
  const boss={x:1483,y:1040,room:null,type:"boss",hp:48,maxHp:48,r:23,dead:false,
    vx:0,vy:0,phase:0,charge:0,cooldown:2,windup:0,flash:0,hitTimer:0,
    spawnTimer:6,arena:165};
  const tombRect={x:32,y:35,w:354,h:234};
  let currentInput=null;
  const trees=[],sheep=[],stones=[],moths=[],particles=[],flowers=[],relics=[];
  const crownSprites=[],sheepSprites={};
  let dogSprites={},knightSprites={};
  let bg=null, audio=null,cryptFloor=null;
  const cryptProps=[];
  // Stable scene object: no allocations in the per-frame fluid update.
  const fogScene={player,dog,sheep,enemies,boss};
  let groundFog=null;

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
    g.fillStyle=PAL.grass;g.fillRect(0,0,W,H);
    // Broad bands of distinct terrain colour. Built once, not each frame.
    for(let y=0;y<H;y+=12)for(let x=0;x<W;x+=12){
      const colors=BIOMES[biomeAt(x+6,y+6)].ground;
      const variation=Math.abs(Math.floor(Math.sin(x*.129+y*.077)*13871))%colors.length;
      pix(g,x,y,12,12,colors[variation]);
    }
    for(let i=0;i<175;i++){
      const x=rbetween(0,W),y=rbetween(0,H);
      const colors=BIOMES[biomeAt(x,y)].ground;
      noisePatch(g,x,y,rbetween(22,84),rbetween(15,61),
        colors[Math.floor(mapRand()*colors.length)],.45);
    }
    // Region-specific ground detail, rather than identical flowers everywhere.
    for(let i=0;i<2600;i++){
      const x=Math.floor(rbetween(10,W-10)),y=Math.floor(rbetween(10,H-10));
      const region=biomeAt(x,y),v=mapRand();
      if(region==="mire"){
        if(v<.32){pix(g,x,y,2,4,"#617e71");pix(g,x+2,y-3,1,6,"#a5b38e");}
        else if(v<.42)pix(g,x,y,5,2,"#6f827b");
      }else if(region==="highlands"){
        if(v<.56){pix(g,x,y,4,2,"#8f8b82");pix(g,x+2,y-2,3,2,"#d0c1a3");}
      }else if(region==="twilight"){
        if(v<.42){pix(g,x,y,2,3,"#696c86");pix(g,x+3,y-2,2,2,"#b2a1aa");}
      }else if(region==="forest"){
        if(v<.38){pix(g,x,y,5,1,"#66866d");pix(g,x+2,y-2,2,2,"#6a8a70");}
      }else if(v<.34){pix(g,x,y,2,2,"#d0c48f");}
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
    // Less than a quarter of the old woodland density, focused into actual forests.
    for(let c=0;c<240;c++){
      const x=rbetween(85,W-85),y=rbetween(115,H-100);
      if(mapRand()>BIOMES[biomeAt(x,y)].trees)continue;
      const n=3+Math.floor(mapRand()*6);
      const dominant=Math.floor(mapRand()*5);
      for(let j=0;j<n;j++){
        const xx=x+rbetween(-48,48),yy=y+rbetween(-43,43);
        if(xx<15||xx>W-15||yy<30||yy>H-15)continue;
        if(meadowWeight(xx,yy)>.53 || mapRand()>BIOMES[biomeAt(xx,yy)].trees)continue;
        plantTree(xx,yy,dominant);
      }
    }
    // Deliberate wooded borders frame the opening meadow.
    const borders=[[555,720,12],[814,704,10],[594,972,9],[853,939,11],[502,622,10],[770,525,9]];
    for(const [cx,cy,count] of borders){
      for(let i=0;i<count;i++){
        const x=cx+rbetween(-34,34),y=cy+rbetween(-75,75);
        if(meadowWeight(x,y)>.58 || mapRand()>BIOMES[biomeAt(x,y)].trees*.7)continue;
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
      const min=(radius+t.trunkRadius)*OBJECT_SCALE,d2=dx*dx+dy*dy;
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
      osc.type=kind==="bark"?"square":kind==="slash"?"triangle":"sine";
      osc.frequency.setValueAtTime(kind==="bark"?210:kind==="slash"?580:kind==="impact"?190:700,now);
      osc.frequency.exponentialRampToValueAtTime(kind==="bark"?80:kind==="slash"?160:kind==="impact"?95:1100,now+(kind==="bark"?.18:kind==="slash"?.16:.36));
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(kind==="bark"?.09:kind==="slash"?.055:.048,now+.015);
      gain.gain.exponentialRampToValueAtTime(.0001,now+(kind==="bark"?.2:kind==="slash"?.18:.38));
      osc.connect(gain);gain.connect(audio.destination);
      osc.start(now);osc.stop(now+(kind==="bark"?.22:kind==="slash"?.2:.39));
    }catch(err){/* silent mode is fine */}
  }

  function nearestRelic() {
    const me=activeActor();
    let best=null,dist=24;
    for(const relic of relics){
      if(relic.found)continue;
      const d=distance(relic,me);
      if(d<dist){best=relic;dist=d;}
    }
    return best;
  }

  function tryInteract() {
    const portal=nearestPortal();
    if(portal)return usePortal(portal);
    if(underground!==null)return false;
    const relic=nearestRelic();
    if(!relic)return false;
    relic.found=true;ringGlow=1.1;
    addParticles(relic.x,relic.y,"#e4c58d",24);
    sound("find");
    showNotice("AN OLD WIND CHIME","It remembers the path home. "+relics.filter(r=>r.found).length+" of 3 found.",5);
    return true;
  }

  function switchCharacter() {
    controlled=controlled==="knight"?"dog":"knight";
    currentInput=null;
    sword.active=false;sword.step=0;sword.queued=0;
    switchText.textContent=controlled.toUpperCase();
    switchButton.dataset.active=controlled;
    switchButton.setAttribute("aria-label","Switch control to "+(controlled==="knight"?"dog":"knight"));
    actionIcon.innerHTML=controlled==="dog"?dogIconMarkup:weapon==="crossbow"?bowIconMarkup:swordIconMarkup;
    weaponButton.disabled=controlled!=="knight";
    showNotice(controlled==="knight"?"THE KNIGHT":"THE SHEEPDOG",
      controlled==="knight"?"Tap quickly to chain three sword strikes. The third is a powerful finisher.":"Herd the flock with a bark. Your knight will follow behind.",3.3);
    updateActionLabel();
  }

  function updateActionLabel() {
    const portal=nearestPortal();
    const relic=underground===null?nearestRelic():null;
    let label=controlled==="dog"?"BARK":weapon==="crossbow"?"SHOOT":"ATTACK";
    let mode=controlled;
    if(relic||portal){label="USE";mode="use";}
    else if(controlled==="knight"&&weapon==="sword"){
      if(sword.active&&sword.step===2 || !sword.active&&sword.step===2&&time-sword.lastFinish<COMBO_GRACE){
        label="FINISH";mode="combo3";
      }else if(sword.active&&sword.step===1 || !sword.active&&sword.step===1&&time-sword.lastFinish<COMBO_GRACE){
        label="COMBO";mode="combo2";
      }
    }
    if(actionLabel.textContent!==label)actionLabel.textContent=label;
    if(action.dataset.mode!==mode)action.dataset.mode=mode;
    if(controlled==="knight"&&weapon==="crossbow"&&mode!=="use")mode="crossbow";
    const aria=mode==="use"?"Interact":controlled==="dog"?"Bark":weapon==="crossbow"?"Fire crossbow":"Sword attack";
    if(action.getAttribute("aria-label")!==aria)action.setAttribute("aria-label",aria);
  }

  function bark() {
    if(time-barkTime<.48)return;
    barkTime=time;
    sound("bark");
    if(navigator.vibrate)navigator.vibrate(18);
    addParticles(dog.x,dog.y-7,"#f2e6ca",8);
    for(const s of sheep){
      if(s.home)continue;
      const dx=s.x-dog.x,dy=s.y-dog.y,d=Math.hypot(dx,dy);
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
  }

  function startSwing(step, queued=0) {
    sword.active=true;
    sword.step=step;
    sword.elapsed=0;
    sword.duration=COMBO_DURATIONS[step-1];
    sword.queued=queued;
    sword.hit=false;
    sword.facing=player.angle;
    if(navigator.vibrate)navigator.vibrate(step===3?26:9);
    sound("slash");
    updateActionLabel();
  }

  function doAction() {
    if(tryInteract())return;
    if(controlled==="dog"){bark();return;}
    if(weapon==="crossbow"){shootCrossbow();return;}
    if(sword.active){
      // Preserve multiple quick taps so triple-tapping always reaches the finisher.
      if(sword.step<3)sword.queued=Math.min(3-sword.step,sword.queued+1);
      return;
    }
    const canChain=sword.step>0 && sword.step<3 && time-sword.lastFinish<COMBO_GRACE;
    startSwing(canChain?sword.step+1:1);
  }

  function hitSwordTargets() {
    const radius=(sword.step===3?47:35)*OBJECT_SCALE;
    const cone=sword.step===3?1.65:1.29;
    let found=false;
    for(const o of obstacles){
      if(o.broken)continue;
      const dx=o.x-player.x,dy=(o.y-player.y)*1.12;
      const dist=Math.hypot(dx,dy);
      if(dist>radius+3)continue;
      const theta=Math.atan2(dy,dx);
      const diff=Math.atan2(Math.sin(theta-sword.facing),Math.cos(theta-sword.facing));
      if(Math.abs(diff)>cone)continue;
      found=true;
      o.hitCount++;o.flash=.25;o.shake=.32;
      if(o.type==="bramble"){
        o.hp-=sword.step===3?3:1;
        if(o.hp<=0){
          o.broken=true;
          addParticles(o.x,o.y,"#719784",17);
          addParticles(o.x,o.y,"#57436e",12);
        }else addParticles(o.x,o.y,"#c0ae89",7);
      }else{
        addParticles(o.x,o.y-10,"#e2c591",8);
      }
    }
    for(const e of enemies.concat([boss])){
      if(e.dead||!inCurrentRoom(e))continue;
      const dx=e.x-player.x,dy=e.y-player.y;
      const dist=Math.hypot(dx,dy*1.12);
      if(dist>radius+e.r*OBJECT_SCALE)continue;
      const theta=Math.atan2(dy,dx);
      const diff=Math.atan2(Math.sin(theta-sword.facing),Math.cos(theta-sword.facing));
      if(Math.abs(diff)>cone)continue;
      hurtEnemy(e,sword.step===3?5:2,dx/Math.max(1,dist),dy/Math.max(1,dist));
      found=true;
    }
    if(found){
      sound("impact");
      if(navigator.vibrate)navigator.vibrate(sword.step===3?32:13);
    }
  }

  function updateSword(dt) {
    if(!sword.active){
      if(sword.step>0&&time-sword.lastFinish>COMBO_GRACE)sword.step=0;
      return;
    }
    sword.elapsed+=dt;
    if(!sword.hit && sword.elapsed>=sword.duration*.27){
      sword.hit=true;hitSwordTargets();
      if(sword.step===3)addParticles(player.x+Math.cos(sword.facing)*25,
        player.y+Math.sin(sword.facing)*20-8,"#e8dbc6",10);
    }
    // Skip the tail of recovery when the next combo tap is buffered.
    if(sword.hit && sword.queued>0 && sword.step<3 && sword.elapsed>=sword.duration*.72){
      startSwing(sword.step+1,sword.queued-1);
      return;
    }
    if(sword.elapsed>=sword.duration){
      sword.active=false;sword.lastFinish=time;
    }
  }

  function updatePlayer(dt){
    let dx=0,dy=0,strength=0;
    const leader=activeActor();
    if(currentInput){
      const ax=currentInput.x-currentInput.startX,ay=currentInput.y-currentInput.startY;
      const d=Math.hypot(ax,ay);
      if(d>7){strength=clamp((d-7)/35,0,1);dx=ax/d;dy=ay/d;}
    }
    leader.moving=strength;
    if(strength>.04){
      const slow=leader===player&&sword.active?(sword.step===3?.82:.92):1;
      const speed=leader.speed*strength*slow;
      leader.x+=dx*speed*dt;leader.y+=dy*speed*dt;
      leader.angle=Math.atan2(dy,dx);
      if(Math.abs(dx)>Math.abs(dy)*.85)leader.face=dx>0?"right":"left";
      else leader.face=dy>0?"down":"up";
      leader.step+=dt*(leader===dog?16:11)*strength*slow;
      if(Math.random()<dt*3*strength)addParticles(leader.x,leader.y,"#bec08d",1);
    }
    if(underground===null)collideTrees(leader,leader===dog?4:5);

    const follower=leader===player?dog:player;
    const offset=leader===player?17:21;
    const targetX=leader.x-Math.cos(leader.angle)*offset+6;
    const targetY=leader.y-Math.sin(leader.angle)*offset+7;
    const fx=targetX-follower.x,fy=targetY-follower.y;
    const dist=Math.hypot(fx,fy);
    follower.moving=dist>14?1:0;
    if(dist>14){
      const speed=Math.min(follower.speed*dt,Math.max(0,dist-10));
      const step=dist>0?speed/dist:0;
      follower.x+=fx*step;follower.y+=fy*step;
      follower.angle=Math.atan2(fy,fx);
      if(Math.abs(fx)>Math.abs(fy)*.85)follower.face=fx>0?"right":"left";
      else follower.face=fy>0?"down":"up";
      follower.step+=dt*(follower===dog?13:9)*clamp(dist/35,.45,1);
      if(underground===null)collideTrees(follower,follower===dog?4:5);
    }
    // Keep companions together if a tight thicket completely blocks their route.
    if(dist>235){
      follower.x=lerp(follower.x,leader.x-Math.cos(leader.angle)*20,dt*3);
      follower.y=lerp(follower.y,leader.y-Math.sin(leader.angle)*20,dt*3);
      if(underground===null)collideTrees(follower,follower===dog?4:5);
    }
    constrainCryptActors();
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
      const dx=s.x-dog.x,dy=s.y-dog.y;
      const dogDist=Math.max(.001,Math.hypot(dx,dy));
      const danger=(controlled==="dog"?(dog.moving>.23?53:36):14)/s.bravery;
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
    for(const o of obstacles){o.flash=Math.max(0,o.flash-dt);o.shake=Math.max(0,o.shake-dt);}
    if(noticeTimer>0){
      noticeTimer-=dt;
      if(noticeTimer<=0)notice.classList.add("fade");
    }
  }

  function drawObstacle(g,o){
    const x=Math.round(o.x+Math.sin(o.shake*29)*o.shake*4),y=Math.round(o.y);
    if(o.broken){
      pix(g,x-7,y+1,15,2,"#829b7b");
      pix(g,x-4,y-1,4,3,"#715a6e");
      pix(g,x+3,y-2,3,3,"#517d7b");
      return;
    }
    if(o.type==="dummy"){
      pix(g,x-8,y+1,17,3,"#879d75");
      pix(g,x-1,y-18,3,19,"#55405c");
      pix(g,x,y-17,1,16,"#b68a74");
      pix(g,x-8,y-12,17,3,"#6a4c60");
      pix(g,x-7,y-14,14,9,o.flash>0?"#f6e7c3":"#b88c75");
      pix(g,x-7,y-14,14,2,"#e3c69c");
      pix(g,x-3,y-21,8,7,"#b39280");
      pix(g,x-2,y-20,6,2,"#e9d19f");
      pix(g,x-1,y-11,4,5,"#634a64");
      pix(g,x,y-10,2,3,"#ddc497");
    }else{
      pix(g,x-11,y+1,22,3,"#859c78");
      const dark="#403253",branch=o.flash>0?"#e1d4aa":"#576471";
      for(let i=0;i<12;i++){
        const px=x-11+(i*7%23),py=y-3-(i*5%10);
        pix(g,px,py,6,4,i%3===0?dark:branch);
        if(i%2)pix(g,px+2,py-4,2,5,"#564063");
        if(i%3===0)pix(g,px+1,py-5,2,2,"#d0bd9a");
      }
      if(o.flash>0)pix(g,x-3,y-13,6,3,"#f0e2b5");
    }
  }

  function drawSword(g){
    const p=clamp(sword.elapsed/sword.duration,0,1);
    const final=sword.step===3;
    const base=sword.facing;
    const offset=sword.step===2?1.75:-1.75;
    const sweep=sword.step===2?-3.45:(final?3.7:3.2);
    const angle=base+offset+p*sweep;
    const reach=final?34:26;
    const handX=player.x,handY=player.y-14;
    // Discrete arc samples create a chunky pixel-art trail rather than a vector swoosh.
    for(let j=15;j>=0;j--){
      const q=clamp(p-j*(final?.013:.018),0,1);
      if(p-q>.34)continue;
      const theta=base+offset+q*sweep;
      const fade=j/15;
      const r=reach-(j%3===0?0:2);
      g.globalAlpha=(1-fade)*(.85-Math.abs(p-.5)*.45);
      pix(g,handX+Math.cos(theta)*r-2,handY+Math.sin(theta)*r*.80-1,
        final?4:3,final?3:2,j<5?"#faf4d7":j<11?"#c7dde0":"#92b3b9");
    }
    g.globalAlpha=1;
    // The blade itself moves through the arc in stepped-pixel increments.
    for(let r=7;r<=reach;r+=2){
      const bx=handX+Math.cos(angle)*r,by=handY+Math.sin(angle)*r*.8;
      pix(g,bx-1,by-1,r>reach-6?3:2,2,r>reach-6?"#fff5d9":"#c6d7d5");
    }
    const hX=handX+Math.cos(angle)*6,hY=handY+Math.sin(angle)*6*.8;
    pix(g,hX-2,hY-2,5,3,"#d6ab77");
    pix(g,handX+Math.cos(angle)*2,handY+Math.sin(angle)*2*.8,3,3,"#56415b");
    if(final && p>.42 && p<.78){
      const v=(p-.42)/.36;
      g.globalAlpha=(1-v)*.8;
      for(let i=0;i<18;i++){
        const a=base+(i/17-.5)*2.9;
        const x=player.x+Math.cos(a)*(21+v*26),y=player.y-7+Math.sin(a)*(14+v*17);
        pix(g,x,y,3,2,i%2?"#f7e7ae":"#ccdce0");
      }
      g.globalAlpha=1;
    }
  }

  function drawBark(g){
    const age=time-barkTime;if(age<0||age>.55)return;
    const t=age/.55;
    g.strokeStyle="#fbedd4";g.globalAlpha=(1-t)*.65;
    g.lineWidth=1;
    for(let i=0;i<3;i++){
      const r=((12+i*11)+age*64)*OBJECT_SCALE;
      g.beginPath();g.ellipse(dog.x,dog.y-6,r,r*.65,0,0,TAU);g.stroke();
    }
    g.globalAlpha=1;
  }

  function drawTree(g,t){
    const sprite=crownSprites[t.species*12+(t.twilight?6:0)+t.sprite];
    const sway=Math.sin(time*.65+t.sway)>0.93?1:0;
    const w=Math.round(96*t.size),h=Math.round(108*t.size);
    // Fade overlapping crown only when the knight or dog walks below it.
    let fade=1;
    for(const actor of [player,dog]){
      const dx=Math.abs(actor.x-t.x),dy=actor.y-t.y;
      if(dx<37*t.size*OBJECT_SCALE && dy>-80*t.size*OBJECT_SCALE && dy<8*t.size*OBJECT_SCALE){
        const near=1-clamp(dx/(37*t.size*OBJECT_SCALE),0,1);
        fade=Math.min(fade,.27+(.33*(1-near)));
      }
    }
    g.globalAlpha=fade;
    g.drawImage(sprite,Math.round(t.x-w/2)+sway,Math.round(t.y-94*t.size),w,h);
    g.globalAlpha=1;
  }
  function drawKnight(g){
    const fr=Math.floor(player.step)%2;
    const jolt=sword.active?Math.sin(sword.elapsed/sword.duration*Math.PI)*2:0;
    g.drawImage(knightSprites[player.face+fr],Math.round(player.x-12),Math.round(player.y-25+jolt));
    if(weapon==="crossbow"){
      const a=player.angle;
      // Crossbow silhouette in the knight's hands, aligned with facing.
      g.save();g.translate(Math.round(player.x),Math.round(player.y-14));
      g.rotate(a);pix(g,3,-2,14,4,"#694f4e");
      pix(g,15,-2,2,4,"#e6dfcd");
      pix(g,11,-8,2,15,"#c8b7a1");
      pix(g,11,-8,2,2,"#eee3d2");pix(g,11,5,2,2,"#eee3d2");
      pix(g,5,-1,14,2,"#e5d2a9");
      g.restore();
    }
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
      g.save();g.translate(Math.round(m.x),Math.round(m.y));
      g.scale(OBJECT_SCALE,OBJECT_SCALE);g.translate(-Math.round(m.x),-Math.round(m.y));
      pix(g,m.x-2,m.y,wing?2:1,2,"#d8c2aa");
      pix(g,m.x+1,m.y-1,wing?2:1,2,"#e6d7b9");
      pix(g,m.x,m.y,1,2,PAL.deep);
      g.restore();
    }
  }
  function drawParticles(g){
    for(const p of particles){
      g.globalAlpha=clamp(p.life/p.max,0,1);
      pix(g,p.x,p.y,(p.style==="dot"?2:1)*OBJECT_SCALE,2*OBJECT_SCALE,p.color);
    }
    g.globalAlpha=1;
  }



  function spawnAdventure(){
    tombs.push({id:0,x:827,y:1090,name:"CRYPT OF ASH"},{id:1,x:356,y:363,name:"FORGOTTEN VAULT"},{id:2,x:1286,y:790,name:"WEEPING TOMB"});
    const profiles={
      bandit:{hp:5,r:8},wolf:{hp:4,r:8},slime:{hp:3,r:7},
      golem:{hp:10,r:11},wisp:{hp:4,r:8},ghost:{hp:4,r:7}
    };
    const makeEnemy=(type,x,y,room=null)=>{
      const {hp,r}=profiles[type];
      return {type,x,y,room,originX:x,originY:y,hp,maxHp:hp,r,
        dead:false,vx:0,vy:0,flash:0,phase:rbetween(0,TAU),
        cooldown:rbetween(.7,2),attackTime:0,charge:0,wander:rbetween(0,TAU),
        stun:0,hitTimer:0};
    };
    // Each overworld region has exclusive enemy species and a fixed population.
    // Keep the start, tomb entrances, and boss collision zone navigable.
    const totals={meadow:0,forest:0,mire:0,highlands:0,twilight:0};
    let remaining=Object.values(BIOMES).reduce((n,b)=>n+b.quota,0);
    for(let attempts=0;attempts<18000 && remaining>0;attempts++){
      const x=rbetween(55,W-55),y=rbetween(65,H-60);
      const region=biomeAt(x,y),config=BIOMES[region];
      if(totals[region]>=config.quota)continue;
      if(Math.hypot(x-player.x,y-player.y)<170)continue;
      if(Math.hypot(x-HOME.x,y-HOME.y)<75)continue;
      if(Math.hypot(x-boss.x,y-boss.y)<100)continue;
      if(tombs.some(t=>Math.hypot(x-t.x,y-t.y)<42))continue;
      if(trees.some(t=>Math.abs(t.x-x)<t.trunkRadius+13 && Math.abs(t.y-y)<t.trunkRadius+13))continue;
      if(enemies.some(e=>e.room===null && Math.hypot(x-e.x,y-e.y)<43))continue;
      enemies.push(makeEnemy(config.enemy,x,y));
      totals[region]++;remaining--;
    }
    for(let room=0;room<3;room++){
      for(let i=0;i<4+room;i++){
        const x=85+(i%3)*114+rbetween(-12,12);
        const y=90+Math.floor(i/3)*90+rbetween(-9,9);
        enemies.push(makeEnemy("ghost",x,y,room));
      }
    }
    for(let i=0;i<14;i++){
      const a=i/14*TAU;
      const radius=100+(i%3)*23;
      mudPuddles.push({x:boss.x+Math.cos(a)*radius,y:boss.y+Math.sin(a)*radius*.85,r:12+i%4*4});
    }
    for(let room=0;room<3;room++){
      for(let i=0;i<7;i++)cryptProps.push({room,x:64+(i%3)*131,y:86+Math.floor(i/3)*69,type:i%3===0?"coffin":i%3===1?"urn":"column"});
    }
  }

  const inCurrentRoom=e=>underground===null?e.room===null:e.room===underground;
  function nearestPortal(){
    if(transitionLock>0)return null;
    const focus=activeActor();
    if(underground!==null){
      return Math.hypot(focus.x-207,focus.y-247)<24?{exit:true}:null;
    }
    for(const entry of tombs)if(distance(focus,entry)<29)return entry;
    return null;
  }
  function usePortal(p){
    if(!p)return false;
    transitionLock=.9;
    currentInput=null;
    sword.active=false;sword.step=0;sword.queued=0;
    bolts.length=0;
    if(p.exit){
      const ret=entranceReturn||{x:684,y:820};
      underground=null;
      player.x=ret.x+23;player.y=ret.y+30;
      dog.x=player.x-14;dog.y=player.y+10;
      areaLabel.textContent=biomeLabel(player.x,player.y);
      showNotice("BACK IN DAYLIGHT","The woodland welcomes you home.",3.4);
    }else{
      entranceReturn={x:p.x,y:p.y};
      underground=p.id;
      player.x=207;player.y=220;dog.x=192;dog.y=226;
      player.face="up";player.angle=-Math.PI/2;
      areaLabel.textContent=p.name;
      showNotice(p.name,"Ancient dead stir below. Find the stairs to return to daylight.",5);
    }
    camX=activeActor().x-screenW/2;camY=activeActor().y-screenH/2;
    return true;
  }
  function toggleWeapon(){
    if(controlled!=="knight")return;
    weapon=weapon==="sword"?"crossbow":"sword";
    sword.active=false;sword.step=0;sword.queued=0;
    weaponButton.dataset.weapon=weapon;
    weaponLabel.textContent=weapon==="crossbow"?"BOW":"SWORD";
    weaponButton.querySelector(".weapon-glyph").textContent=weapon==="crossbow"?"➶":"⚔";
    actionIcon.innerHTML=weapon==="crossbow"?bowIconMarkup:swordIconMarkup;
    updateActionLabel();
  }
  function healthRefresh(){
    heartsLabel.textContent="♥ ".repeat(health).trim()+(" ♡".repeat(maxHealth-health));
  }
  function damagePlayer(amount,sourceX,sourceY){
    if(invincible>0||health<=0)return;
    invincible=1.15;
    damageFlash=1;
    // Show the hit on this exact event, not only on the next animation frame.
    damageFeedback.style.opacity="1";
    health=Math.max(0,health-amount);healthRefresh();
    addParticles(player.x,player.y-10,"#df9c9c",10);
    if(health>0){
      showNotice("OUCH!","Watch enemy attacks. Keep moving and time your strikes.",2);
      sound("impact");
    }else{
      showNotice("BACK TO THE CAMP","Your knight wakes safely beside the stone circle.",5);
      health=maxHealth;healthRefresh();
      underground=null;entranceReturn=null;
      player.x=680;player.y=821;dog.x=667;dog.y=837;
      invincible=2.2;sword.active=false;sword.step=0;
      bolts.length=0;areaLabel.textContent=biomeLabel(player.x,player.y);
      camX=player.x-screenW/2;camY=player.y-screenH/2;
    }
  }
  function hurtEnemy(e,damage,dx,dy){
    if(e.dead)return;
    e.hp=Math.max(0,e.hp-damage);e.flash=.23;e.stun=e.type==="boss"?.15:.29;
    e.vx+=dx*(e.type==="boss"?5:13);e.vy+=dy*(e.type==="boss"?5:13);
    addParticles(e.x,e.y-8,e.type==="ghost"||e.type==="wisp"?"#a4e4d3":e.type==="slime"?"#b9da86":e.type==="golem"?"#c2b9aa":e.type==="wolf"?"#a6a29c":"#e6b994",7);
    sound("impact");
    if(e.hp<=0){
      e.dead=true;
      addParticles(e.x,e.y-8,e.type==="boss"?"#d3b38c":"#d8c5a1",e.type==="boss"?56:15);
      if(e.type==="boss"){
        bossBar.hidden=true;
        showNotice("THE MIRE KING HAS FALLEN","The forest is safe again — but the tombs still hold their secrets.",12);
        victoryNotice=true;
      }
    }
  }
  function selectBowAim(){
    const origin=player,a=player.angle;
    let target=null,best=Infinity;
    for(const e of enemies.concat([boss])){
      if(e.dead||!inCurrentRoom(e))continue;
      const dx=e.x-origin.x,dy=e.y-origin.y,d=Math.hypot(dx,dy);
      if(d>175||d<3)continue;
      const angle=Math.atan2(dy,dx);
      const diff=Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a)));
      if(diff>.92)continue;
      const score=d+diff*63;
      if(score<best){best=score;target=e;}
    }
    return target?Math.atan2(target.y-origin.y,target.x-origin.x):a;
  }
  function shootCrossbow(){
    if(time-lastShot<.58)return;
    lastShot=time;
    const a=selectBowAim();
    bolts.push({x:player.x+Math.cos(a)*11,y:player.y-10+Math.sin(a)*11,
      vx:Math.cos(a)*205,vy:Math.sin(a)*205,life:1.4,room:underground,damage:2});
    addParticles(player.x+Math.cos(a)*12,player.y-9+Math.sin(a)*12,"#f4e9c4",5);
    sound("slash");
  }
  function updateBolts(dt){
    for(let i=bolts.length-1;i>=0;i--){
      const b=bolts[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      let hit=false;
      if(underground!==null &&
        (b.x<tombRect.x+9||b.x>tombRect.x+tombRect.w-9||b.y<tombRect.y+10||b.y>tombRect.y+tombRect.h-10))hit=true;
      if(!hit){
        for(const e of enemies.concat([boss])){
          if(e.dead||!inCurrentRoom(e))continue;
          if(Math.hypot(e.x-b.x,(e.y-4)-b.y)<e.r*OBJECT_SCALE+5){
            const len=Math.hypot(b.vx,b.vy)||1;
            hurtEnemy(e,b.damage,b.vx/len,b.vy/len);
            hit=true;break;
          }
        }
      }
      if(!hit && underground===null){
        for(const o of obstacles){
          if(o.broken||o.type==="dummy")continue;
          if(Math.hypot(o.x-b.x,(o.y-6)-b.y)<12){
            o.flash=.2;o.shake=.25;o.hp--;
            if(o.hp<=0){o.broken=true;addParticles(o.x,o.y,"#719784",12);}
            hit=true;break;
          }
        }
      }
      if(hit||b.life<=0){
        if(hit)addParticles(b.x,b.y,"#e7d6ba",4);
        bolts.splice(i,1);
      }
    }
  }
  function updateEnemies(dt){
    if(invincible>0)invincible=Math.max(0,invincible-dt);
    if(transitionLock>0)transitionLock=Math.max(0,transitionLock-dt);
    for(const e of enemies){
      if(e.dead||!inCurrentRoom(e))continue;
      e.phase+=dt;e.flash=Math.max(0,e.flash-dt);
      e.stun=Math.max(0,e.stun-dt);e.cooldown-=dt;
      const dx=player.x-e.x,dy=player.y-e.y,d=Math.max(1,Math.hypot(dx,dy));
      const detect={ghost:140,bandit:100,slime:80,wolf:126,golem:96,wisp:144}[e.type]||90;
      const speed={ghost:20,bandit:22,slime:14,wolf:39,golem:12,wisp:23}[e.type]||18;
      const near=d<detect;
      let vx=0,vy=0;
      if(e.stun<=0 && near){
        if(e.type==="slime"||e.type==="wolf"){
          if(e.cooldown<=0){
            e.cooldown=e.type==="wolf"?rand(1.2,1.8):rand(1,1.7);
            e.charge=e.type==="wolf"?.43:.35;
            const burst=e.type==="wolf"?84:62;
            e.vx=dx/d*burst;e.vy=dy/d*burst;
          }
          if(e.charge>0){
            e.charge=Math.max(0,e.charge-dt);
            vx=e.vx;vy=e.vy;
          }else if(e.type==="wolf"){vx=dx/d*speed*.64;vy=dy/d*speed*.64;}
        }else if(e.type==="wisp"){
          vx=dx/d*speed+Math.cos(e.phase*3.7)*11;
          vy=dy/d*speed+Math.sin(e.phase*3.2)*11;
        }else{
          const reach=e.type==="golem"?23:e.type==="bandit"?19:13;
          if(d>reach){vx=dx/d*speed;vy=dy/d*speed;}
        }
      }else if(e.stun<=0 && e.type!=="ghost" && e.type!=="wisp"){
        // Small idle patrol instead of stationary enemies.
        e.wander+=dt*.46;
        if(Math.hypot(e.x-e.originX,e.y-e.originY)>30){
          vx=(e.originX-e.x)*.8;vy=(e.originY-e.y)*.8;
        }else{vx=Math.cos(e.wander)*3;vy=Math.sin(e.wander)*3;}
      }else if(e.stun<=0 && (e.type==="ghost"||e.type==="wisp")){
        vx=Math.cos(e.phase*.7)*3;vy=Math.sin(e.phase*.65)*3;
      }
      e.x+=vx*dt;e.y+=vy*dt;
      e.x+=e.vx*dt*(e.stun>0?.9:0);
      e.y+=e.vy*dt*(e.stun>0?.9:0);
      if(e.stun>0){e.vx*=Math.exp(-dt*9);e.vy*=Math.exp(-dt*9);}
      if(underground!==null){
        e.x=clamp(e.x,51,366);e.y=clamp(e.y,56,246);
      }else if(e.type!=="ghost"&&e.type!=="wisp")collideTrees(e,e.r);
      // Attack reach must be >= the AI's preferred stopping distance,
      // otherwise bandits, ghosts and golems idle without ever landing hits.
      const attackReach=e.type==="golem"?28:e.type==="bandit"?23
        :e.type==="ghost"?18:e.type==="wisp"?21:e.r*OBJECT_SCALE+10;
      if(near && d<attackReach){
        if(e.type==="slime"||e.type==="wolf"){
          if(e.hitTimer<=0 && e.charge>0){
            e.hitTimer=e.type==="wolf"?1.2:1.4;damagePlayer(1,e.x,e.y);
          }
        }else if(e.cooldown<=0){
          e.cooldown=e.type==="golem"?1.75:e.type==="ghost"||e.type==="wisp"?1.2:.94;
          damagePlayer(e.type==="golem"?2:1,e.x,e.y);
        }
      }
      e.hitTimer=Math.max(0,e.hitTimer-dt);
    }
    if(underground===null)updateBoss(dt);
    updateBolts(dt);
  }
  function updateBoss(dt){
    if(boss.dead)return;
    boss.phase+=dt;boss.flash=Math.max(0,boss.flash-dt);boss.stun=Math.max(0,boss.stun-dt);
    const dx=player.x-boss.x,dy=player.y-boss.y;
    const d=Math.max(1,Math.hypot(dx,dy));
    const engaged=d<boss.arena;
    bossBar.hidden=!engaged;
    if(engaged){
      bossFill.style.width=Math.round(boss.hp/boss.maxHp*100)+"%";
      if(areaLabel.textContent!=="THE MIRE KING'S BOG")areaLabel.textContent="THE MIRE KING'S BOG";
    }else if(areaLabel.textContent==="THE MIRE KING'S BOG")areaLabel.textContent=biomeLabel(player.x,player.y);
    if(!engaged)return;
    boss.cooldown-=dt;boss.spawnTimer-=dt;
    if(boss.windup>0){
      boss.windup-=dt;
      if(boss.windup<=0){
        boss.charge=.48;
        boss.vx=dx/d*(boss.hp<24?91:75);
        boss.vy=dy/d*(boss.hp<24?91:75);
        sound("impact");
      }
    }else if(boss.charge>0){
      boss.charge-=dt;
      boss.x+=boss.vx*dt;boss.y+=boss.vy*dt;
      if(d<boss.r*OBJECT_SCALE+8 && boss.hitTimer<=0){
        boss.hitTimer=.8;
        damagePlayer(1,boss.x,boss.y);
      }
    }else{
      boss.x+=dx/d*10*dt;boss.y+=dy/d*10*dt;
      if(boss.cooldown<=0){
        boss.windup=.8;boss.cooldown=boss.hp<24?2.2:3.1;
        addParticles(boss.x,boss.y,"#d7b184",6);
      }
    }
    boss.hitTimer=Math.max(0,boss.hitTimer-dt);
    if(boss.hp<24 && boss.spawnTimer<=0){
      boss.spawnTimer=10;
      for(let j=0;j<2;j++){
        const a=rand(0,TAU);
        enemies.push({type:"slime",x:boss.x+Math.cos(a)*33,y:boss.y+Math.sin(a)*33,
          room:null,originX:boss.x,originY:boss.y,hp:3,maxHp:3,r:7,dead:false,
          vx:0,vy:0,flash:0,phase:rand(0,TAU),cooldown:1,attackTime:0,
          charge:0,wander:rand(0,TAU),stun:0,hitTimer:0});
      }
    }
  }
  function constrainCryptActors(){
    if(underground===null)return;
    for(const entity of [player,dog]){
      entity.x=clamp(entity.x,tombRect.x+12,tombRect.x+tombRect.w-12);
      entity.y=clamp(entity.y,tombRect.y+15,tombRect.y+tombRect.h-15);
    }
  }


  function drawCryptBackdrop(g){
    g.fillStyle="#252737";g.fillRect(0,0,screenW,screenH);
    const x=tombRect.x,y=tombRect.y,w=tombRect.w,h=tombRect.h;
    g.fillStyle=underground===1?"#44404e":underground===2?"#34444b":"#3d4450";
    g.fillRect(x,y,w,h);
    // Large stone flags, cracks and uneven mortar, rendered at game resolution.
    for(let iy=0;iy<Math.floor(h/18);iy++)for(let ix=0;ix<Math.floor(w/22)+1;ix++){
      const xx=x+ix*22+(iy%2?11:0),yy=y+iy*18;
      pix(g,xx,yy,20,1,"#292b3b");
      pix(g,xx,yy,1,17,"#303444");
      const seed=((ix*47+iy*13+underground*19)%11);
      if(seed<3)pix(g,xx+6,yy+7,seed+2,1,"#67616a");
      if(seed===6)pix(g,xx+13,yy+11,5,1,"#565668");
    }
    // Inner heavy masonry border and steps into the chamber.
    g.fillStyle="#1d2430";g.fillRect(x-9,y-11,w+18,14);
    g.fillRect(x-9,y+h-1,w+18,11);
    g.fillRect(x-9,y-4,12,h+8);g.fillRect(x+w-3,y-4,12,h+8);
    g.fillStyle="#6c6365";
    for(let i=0;i<w;i+=19){
      pix(g,x+i,y-9,17,3,"#777070");
      pix(g,x+i,y+h+1,16,2,"#57565d");
    }
    for(let j=0;j<h;j+=18){
      pix(g,x-8,y+j,4,16,"#484b57");
      pix(g,x+w+1,y+j,4,16,"#484b57");
    }
    g.fillStyle="#403a46";g.fillRect(184,245,48,19);
    for(let i=0;i<5;i++){
      pix(g,187+i*9,249+i*2,8,2,"#9c9094");
    }
    pix(g,199,245,15,2,"#c1ae9c");
    // Burial alcoves, cracked sarcophagi and mossy free-standing columns.
    for(const p of cryptProps){
      if(p.room!==underground)continue;
      const px=p.x,py=p.y;
      g.save();g.translate(Math.round(px),Math.round(py));
      g.scale(OBJECT_SCALE,OBJECT_SCALE);g.translate(-Math.round(px),-Math.round(py));
      if(p.type==="coffin"){
        pix(g,px-14,py-19,29,32,"#282a3b");
        pix(g,px-11,py-17,23,28,"#83767b");
        pix(g,px-9,py-15,19,24,"#b6a69b");
        pix(g,px-7,py-12,15,1,"#6b6374");
        pix(g,px,py-10,2,17,"#736675");
        pix(g,px-5,py-1,12,2,"#736675");
      }else if(p.type==="column"){
        pix(g,px-8,py-7,19,11,"#262a34");
        pix(g,px-7,py-24,16,20,"#6a6978");
        pix(g,px-6,py-28,15,5,"#9c9296");
        pix(g,px-7,py-5,16,5,"#978b8e");
        pix(g,px-1,py-21,3,14,"#464455");
      }else{
        pix(g,px-6,py-7,13,10,"#30313e");
        pix(g,px-5,py-8,11,10,"#92867c");
        pix(g,px-3,py-5,7,4,"#6b625c");
        pix(g,px-1,py-11,3,3,"#acd5ba");
      }
      g.restore();
    }
    for(const [tx,ty] of [[55,62],[364,62],[55,223],[364,223]]){
      pix(g,tx-2,ty-2,6,7,"#d3b588");
      pix(g,tx-1,ty-7+Math.round(Math.sin(time*7+tx)*2),4,6,"#b3c5a1");
      pix(g,tx,ty-9,2,3,"#e8e1bd");
    }
    g.strokeStyle="#99b9ae";
    g.globalAlpha=.2;
    g.strokeRect(x+4,y+4,w-8,h-8);
    g.globalAlpha=1;
  }
  function drawTombEntrance(g,t){
    const x=Math.round(t.x),y=Math.round(t.y);
    pix(g,x-22,y+6,45,9,"#7d9580");
    pix(g,x-19,y-12,39,24,"#4b4556");
    pix(g,x-16,y-9,32,21,"#93858a");
    pix(g,x-11,y-3,23,18,"#302c41");
    pix(g,x-8,y+1,17,12,"#222738");
    for(let i=0;i<4;i++)pix(g,x-8-i*2,y+6+i*2,18+i*4,2,"#686174");
    pix(g,x-20,y-16,40,6,"#b3a7a0");
    pix(g,x-22,y-11,7,23,"#7d7379");
    pix(g,x+15,y-11,7,23,"#7d7379");
    pix(g,x-8,y-19,16,2,"#d2c7b5");
    const glow=Math.sin(time*1.8+t.id)*.16+.7;
    g.globalAlpha=glow;
    pix(g,x-3,y+3,6,3,"#a6b5aa");
    g.globalAlpha=1;
  }
  function drawEnemy(g,e){
    const x=Math.round(e.x),y=Math.round(e.y);
    const bob=Math.sin(e.phase*(e.type==="slime"?8:3.5));
    const flash=e.flash>0;
    if(e.type==="wisp"){
      const yy=y-14-Math.round(bob*4);
      g.globalAlpha=flash?1:.72+.2*Math.sin(e.phase*1.8);
      pix(g,x-12,y+1,24,2,"#817e9a");
      pix(g,x-7,yy+4,14,14,flash?"#fff0d2":"#8876b2");
      pix(g,x-9,yy+8,18,8,flash?"#fff0d2":"#b2a1cd");
      pix(g,x-6,yy+1,12,9,"#d4c9e0");
      pix(g,x-2,yy+3,4,3,"#f4eeeb");
      pix(g,x-4,yy+9,2,2,"#3a3b55");pix(g,x+3,yy+9,2,2,"#3a3b55");
      pix(g,x-10,yy+14,4,6,"#9b93bb");pix(g,x+6,yy+14,4,5,"#9b93bb");
      g.globalAlpha=1;
    }else if(e.type==="ghost"){
      g.globalAlpha=flash?.95:.57+.15*Math.sin(e.phase*2);
      const yy=y-13-Math.round(bob*3);
      pix(g,x-10,yy+18,20,2,"#506877");
      pix(g,x-7,yy+1,14,20,"#b1d5c6");
      pix(g,x-6,yy-2,12,10,flash?"#f7f1d9":"#ceeadd");
      pix(g,x-8,yy+6,16,9,"#9ac5c6");
      for(let i=0;i<4;i++)pix(g,x-7+i*4,yy+18,3,(i%2?4:7),"#97b3bb");
      pix(g,x-5,yy+6,2,3,"#444960");pix(g,x+3,yy+6,2,3,"#444960");
      pix(g,x-2,yy+10,4,2,"#617c83");
      g.globalAlpha=1;
    }else if(e.type==="slime"){
      const hop=Math.max(0,bob)*3,yy=y-Math.round(hop);
      pix(g,x-10,y+1,22,3,"#8a9f75");
      pix(g,x-9,yy-7,18,10,flash?"#f7e6be":"#416d55");
      pix(g,x-10,yy-4,20,7,flash?"#f7e6be":"#6aa369");
      pix(g,x-7,yy-10,14,9,"#7fbc73");
      pix(g,x-4,yy-8,4,3,"#a9cf7f");
      pix(g,x+3,yy-5,3,3,"#b3d891");
      pix(g,x-5,yy-3,2,2,"#34445a");pix(g,x+4,yy-3,2,2,"#34445a");
    }else if(e.type==="wolf"){
      const leap=Math.max(0,Math.sin(e.phase*9))*2;
      const yy=y-Math.round(leap);
      pix(g,x-12,y+1,24,2,"#748f79");
      pix(g,x-10,yy-12,20,10,flash?"#f7e6be":"#777e7b");
      pix(g,x-7,yy-16,12,9,"#a5a49d");
      pix(g,x-10,yy-20,5,8,"#484a55");pix(g,x+4,yy-21,5,8,"#484a55");
      pix(g,x-5,yy-12,3,2,"#252a37");pix(g,x+3,yy-12,3,2,"#252a37");
      pix(g,x-2,yy-8,4,3,"#d9c2b1");
      pix(g,x-9,yy-2,4,5,"#464755");pix(g,x+5,yy-2,4,5,"#464755");
    }else if(e.type==="golem"){
      const step=Math.sin(e.phase*2)>0?1:0;
      pix(g,x-13,y+2,27,3,"#918c81");
      pix(g,x-10,y-13+step,9,17,"#665f62");
      pix(g,x+2,y-13-step,9,17,"#615b60");
      pix(g,x-15,y-29,30,19,"#494752");
      pix(g,x-13,y-31,25,21,flash?"#f1e2be":"#96918a");
      pix(g,x-6,y-24,7,3,"#a8b8a7");pix(g,x+4,y-24,7,3,"#a8b8a7");
      pix(g,x-17,y-25,6,19,"#767071");pix(g,x+12,y-25,6,19,"#767071");
      pix(g,x-5,y-19,3,3,"#e5ce89");pix(g,x+5,y-19,3,3,"#e5ce89");
      pix(g,x-8,y-13,16,3,"#58525a");
    }else if(e.type==="bandit"){
      const step=Math.sin(e.phase*6)>0?1:0;
      pix(g,x-9,y+1,18,2,"#84957e");
      pix(g,x-6,y-6+step,5,9,"#342f44");pix(g,x+2,y-6-step,5,9,"#342f44");
      pix(g,x-8,y-21,17,17,"#3b3146");
      pix(g,x-6,y-19,13,13,flash?"#e4d7ba":"#725367");
      pix(g,x-4,y-16,8,7,"#5c434e");
      pix(g,x-9,y-24,18,11,"#382e49");
      pix(g,x-6,y-20,12,5,"#c0a288");
      pix(g,x-5,y-19,4,2,"#252637");pix(g,x+2,y-19,4,2,"#252637");
      pix(g,x-9,y-12,4,9,"#4a3c49");pix(g,x+7,y-12,4,9,"#4a3c49");
      pix(g,x+10,y-11,2,13,"#c6c0ae");
      pix(g,x+9,y-11,4,2,"#665066");
    }else if(e.type==="boss"){
      const bounce=Math.sin(e.phase*1.3)*2;
      const yy=y+Math.round(bounce);
      pix(g,x-34,yy+1,68,7,"#777b64");
      pix(g,x-29,yy-17,59,20,flash?"#e7cf9e":"#5b5147");
      pix(g,x-27,yy-34,54,30,flash?"#d1b896":"#736957");
      pix(g,x-20,yy-43,40,18,"#675747");
      pix(g,x-21,yy-48,15,17,"#514637");
      pix(g,x+7,yy-46,15,17,"#514637");
      pix(g,x-15,yy-35,12,9,"#352e38");
      pix(g,x+6,yy-35,12,9,"#352e38");
      pix(g,x-12,yy-34,6,5,"#efba72");pix(g,x+9,yy-34,6,5,"#efba72");
      pix(g,x-5,yy-21,12,5,"#3f3538");
      for(let i=0;i<9;i++)pix(g,x-30+i*7,yy-6+i%3*2,4,10,"#877759");
      pix(g,x-34,yy-17,8,24,"#5a493c");pix(g,x+27,yy-17,8,24,"#55473b");
      pix(g,x-24,yy-45,9,5,"#a39470");
      pix(g,x+15,yy-43,7,4,"#a39470");
      if(e.windup>0){
        g.strokeStyle="#e3b988";g.globalAlpha=.7;
        g.beginPath();g.ellipse(e.x,e.y,35+Math.sin(time*12)*4,20,0,0,TAU);g.stroke();
        g.globalAlpha=1;
      }
    }
    if(e.hp<e.maxHp && !e.dead && e.type!=="boss"){
      const barY=y-(e.type==="ghost"||e.type==="wisp"||e.type==="golem"?35:29);
      pix(g,x-10,barY,20,2,"#342f45");
      pix(g,x-10,barY,Math.max(1,20*e.hp/e.maxHp),2,"#ca8a88");
    }
  }
  function drawBolts(g){
    for(const bolt of bolts){
      if(bolt.room!==underground)continue;
      const a=Math.atan2(bolt.vy,bolt.vx);
      g.save();
      g.translate(Math.round(bolt.x),Math.round(bolt.y));
      g.rotate(a);
      g.scale(OBJECT_SCALE,OBJECT_SCALE);
      pix(g,-6,-1,12,2,"#dfd2ad");
      pix(g,5,-2,3,4,"#f4eee2");
      pix(g,-6,-3,3,6,"#858f91");
      g.restore();
    }
  }
  // Keep world positions and camera unchanged: only each object's silhouette shrinks.
  // Foot anchoring and integer translation preserve crisp pixel-art registration.
  function drawScaledObject(g,x,y,draw,obj){
    const px=Math.round(x),py=Math.round(y);
    g.save();
    g.translate(px,py);
    g.scale(OBJECT_SCALE,OBJECT_SCALE);
    g.translate(-px,-py);
    draw(g,obj);
    g.restore();
  }

  function drawCrypt(){
    const cx=Math.round(camX),cy=Math.round(camY);
    ctx.fillStyle="#252737";ctx.fillRect(0,0,screenW,screenH);
    ctx.save();ctx.translate(-cx,-cy);
    drawCryptBackdrop(ctx);
    if(groundFog)groundFog.draw(ctx,false);
    const ordered=[];
    for(const e of enemies)if(!e.dead&&inCurrentRoom(e))ordered.push({y:e.y,type:"enemy",o:e});
    ordered.push({y:player.y,type:"knight",o:player},{y:dog.y,type:"dog",o:dog});
    ordered.sort((a,b)=>a.y-b.y);
    for(const a of ordered){
      if(a.type==="enemy")drawScaledObject(ctx,a.o.x,a.o.y,drawEnemy,a.o);
      else if(a.type==="knight")drawScaledObject(ctx,player.x,player.y,drawKnight,player);
      else drawScaledObject(ctx,dog.x,dog.y,drawDog,dog);
    }
    drawBolts(ctx);
    if(groundFog)groundFog.draw(ctx,true);
    drawParticles(ctx);
    ctx.restore();
  }

  function drawWorld(){
    if(underground!==null){drawCrypt();return;}
    // Snap camera to integer world pixels to preserve crisp, stable nearest-neighbour pixels.
    const cx=Math.round(camX),cy=Math.round(camY);
    ctx.fillStyle=PAL.grass;ctx.fillRect(0,0,screenW,screenH);
    const w=Math.min(screenW,W-cx),h=Math.min(screenH,H-cy);
    if(w>0&&h>0)ctx.drawImage(bg,cx,cy,w,h,0,0,w,h);
    ctx.save();ctx.translate(-cx,-cy);
    for(const f of flowers){
      if(f.x<cx-3||f.x>cx+screenW+3||f.y<cy-3||f.y>cy+screenH+3)continue;
      drawScaledObject(ctx,f.x,f.y,drawFlower,f);
    }
    drawScaledObject(ctx,HOME.x,HOME.y,drawHome,HOME);
    for(const puddle of mudPuddles){
      ctx.fillStyle="#84735e";ctx.globalAlpha=.65;
      ctx.beginPath();ctx.ellipse(puddle.x,puddle.y,puddle.r,puddle.r*.53,0,0,TAU);ctx.fill();
      ctx.globalAlpha=1;
      pix(ctx,puddle.x-4,puddle.y,8,1,"#a59370");
    }
    for(const rock of stones){
      if(rock.x<cx-9||rock.x>cx+screenW+9||rock.y<cy-9||rock.y>cy+screenH+9)continue;
      ctx.save();ctx.translate(Math.round(rock.x),Math.round(rock.y));
      ctx.scale(OBJECT_SCALE,OBJECT_SCALE);ctx.translate(-Math.round(rock.x),-Math.round(rock.y));
      drawStone(ctx,rock.x,rock.y,Math.floor(rock.size),rock.kind);ctx.restore();
    }
    // Diffuse low-altitude fog under characters; depth wisps render above them.
    if(groundFog)groundFog.draw(ctx,false);
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
    for(const entrance of tombs)if(entrance.x>cx-50&&entrance.x<cx+screenW+50&&entrance.y>cy-50&&entrance.y<cy+screenH+50)
      actors.push({y:entrance.y,kind:6,object:entrance});
    for(const e of enemies)if(!e.dead&&inCurrentRoom(e)&&e.x>cx-50&&e.x<cx+screenW+50&&e.y>cy-50&&e.y<cy+screenH+50)
      actors.push({y:e.y,kind:7,object:e});
    if(!boss.dead && boss.x>cx-75&&boss.x<cx+screenW+75&&boss.y>cy-75&&boss.y<cy+screenH+75)
      actors.push({y:boss.y,kind:7,object:boss});
    actors.push({y:player.y,kind:2,object:player});
    actors.push({y:dog.y,kind:5,object:dog});
    actors.sort((a,b)=>a.y-b.y);
    for(const a of actors){
      const draw=a.kind===0?drawTree:a.kind===1?drawSheep:a.kind===2?drawKnight
        :a.kind===5?drawDog:a.kind===4?drawObstacle:a.kind===6?drawTombEntrance
        :a.kind===7?drawEnemy:drawShrine;
      drawScaledObject(ctx,a.object.x,a.object.y,draw,a.object);
    }
    drawMoths(ctx);drawBark(ctx);drawBolts(ctx);
    if(groundFog)groundFog.draw(ctx,true);
    drawParticles(ctx);
    ctx.restore();
  }

  function frame(timestamp){
    if(!last)last=timestamp;
    const dt=Math.min(.05,(timestamp-last)/1000);last=timestamp;time+=dt;
    updatePlayer(dt);updateSword(dt);
    if(underground===null)updateSheep(dt);
    updateEnemies(dt);updateParticles(dt);updateActionLabel();
    if(damageFlash>0){
      damageFlash=Math.max(0,damageFlash-dt*1.65);
      // Very visible on initial contact, then a smooth fade over ~0.6 sec.
      const intensity=damageFlash>.78?1:Math.pow(damageFlash/.78,1.4);
      damageFeedback.style.opacity=intensity.toFixed(3);
    }
    if(underground===null && (boss.dead || Math.hypot(player.x-boss.x,player.y-boss.y)>=boss.arena)){
      const region=biomeLabel(activeActor().x,activeActor().y);
      if(areaLabel.textContent!==region)areaLabel.textContent=region;
    }
    const ease=1-Math.exp(-dt*4.5);
    const focus=activeActor();
    const width=underground===null?W:420,height=underground===null?H:300;
    camX=clamp(lerp(camX,focus.x-screenW/2,ease),0,Math.max(0,width-screenW));
    camY=clamp(lerp(camY,focus.y-screenH/2,ease),0,Math.max(0,height-screenH));
    groundFog.update(dt,camX,camY,underground,fogScene,screenW,screenH);
    drawWorld();
    if(damageFlash>0){
      // Canvas-level safety net: the whole world flashes, even if the HUD
      // overlay is obscured by a host browser or compositing issue.
      ctx.save();
      ctx.globalAlpha=.46*Math.min(1,damageFlash*1.45);
      ctx.fillStyle="#ec354c";
      ctx.fillRect(0,0,screenW,screenH);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }

  function setupInput(){
    game.addEventListener("pointerdown",e=>{
      if(e.target.closest("#action")||e.target.closest("#switch")||e.target.closest("#weapon"))return;
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
    weaponButton.addEventListener("pointerdown",e=>e.stopPropagation());
    weaponButton.addEventListener("click",e=>{e.stopPropagation();toggleWeapon();});
    switchButton.addEventListener("pointerdown",e=>e.stopPropagation());
    switchButton.addEventListener("click",e=>{e.stopPropagation();switchCharacter();});
    // Trigger on contact, not release. Retain a keyboard and accessibility fallback.
    action.addEventListener("pointerdown",e=>{
      e.stopPropagation();
      if(e.button!==0)return;
      if(e.cancelable)e.preventDefault();
      doAction();
    });
    action.addEventListener("click",e=>{
      e.stopPropagation();
      if(e.detail===0)doAction(); // Synthetic keyboard / assistive-tech click.
    });
    action.addEventListener("contextmenu",e=>e.preventDefault());
    document.addEventListener("contextmenu",e=>e.preventDefault());
  }

  function init(){
    resize();
    buildTreeSprites();buildSheepSprites();buildDogSprites();buildKnightSprites();
    generateTrees();makeGround();spawnLife();spawnTargets();spawnAdventure();
    healthRefresh();weaponButton.dataset.weapon="sword";
    groundFog=new window.AboveGroundFog(document,biomeAt);
    groundFog.configure(screenW,screenH,camX,camY,underground);
    setupInput();
    window.addEventListener("resize",resize);
    window.addEventListener("orientationchange",resize);
    document.addEventListener("visibilitychange",()=>{last=0;currentInput=null;});
    requestAnimationFrame(frame);
  }
  init();
})();