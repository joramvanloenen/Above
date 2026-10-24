/* ABOVE — a touch-first, self-contained pixel-art sheep-herding adventure.
   All pixels and sounds are generated at runtime; no external assets required. */
(() => {
  "use strict";

  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d", { alpha: false });
  const action = document.getElementById("action");
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
  const player={x:680,y:821,angle:-Math.PI/2,face:"up",step:0,speed:37};
  let currentInput=null;
  const trees=[],sheep=[],stones=[],moths=[],particles=[],flowers=[],relics=[];
  const crownSprites=[],sheepSprites={};
  let dogSprites={};
  let bg=null, audio=null;

  function resize() {
    screenW = Math.max(105,Math.ceil(innerWidth / SCALE));
    screenH = Math.max(105,Math.ceil(innerHeight / SCALE));
    canvas.width=screenW; canvas.height=screenH;
    ctx.imageSmoothingEnabled=false;
    camX=clamp(player.x-screenW/2,0,W-screenW);
    camY=clamp(player.y-screenH/2,0,H-screenH);
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
    for(let i=0;i<11500;i++){
      const x=Math.floor(rbetween(3,W-3)),y=Math.floor(rbetween(3,H-3));
      const val=mapRand();
      if(val<.49)continue;
      const color=val<.65?"#88a77c":val<.81?"#849f83":val<.94?"#c0ba7d":"#e3ca88";
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

  function generateTrees() {
    // Cluster planting creates the dense, tangled woodland silhouettes in the reference.
    for(let c=0;c<145;c++){
      const x=rbetween(85,W-85),y=rbetween(115,H-100);
      const n=3+Math.floor(mapRand()*11);
      for(let j=0;j<n;j++){
        const xx=x+rbetween(-39,39),yy=y+rbetween(-33,33);
        if(xx<15||xx>W-15||yy<30||yy>H-15)continue;
        if(meadowWeight(xx,yy)>.53)continue;
        trees.push({x:xx,y:yy,sprite:Math.floor(mapRand()*9),sway:mapRand()*TAU});
      }
    }
    // Deliberate wooded borders frame the opening meadow.
    const borders=[[555,720,40],[814,704,43],[594,972,36],[853,939,40],[502,622,35],[770,525,35]];
    for(const [cx,cy,count] of borders){
      for(let i=0;i<count;i++){
        const x=cx+rbetween(-34,34),y=cy+rbetween(-75,75);
        if(meadowWeight(x,y)>.58)continue;
        trees.push({x,y,sprite:Math.floor(mapRand()*9),sway:mapRand()*TAU});
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

  function makeCrown(variant){
    const c=makeCanvas(72,88),g=c.getContext("2d"),r=seeded(1509+variant*47);
    const lobes=[
      [35,31,24,24],[21,39,15,17],[49,38,15,19],
      [34,17,20,14],[19,25,12,13],[52,26,13,16],
      [26,48,15,15],[43,51,16,13],
      [33+r()*7-3,8+r()*4,14,11],
      [12+r()*4,44,10,11],[58+r()*2,46,9,12]
    ];
    // Cast shadow at the foot, then trunk, then several layers of canopy.
    pix(g,13,76,50,4,"#86a37b");pix(g,17,80,41,3,"#8ca87c");
    pix(g,32,52,8,28,PAL.deep);
    pix(g,35,52,3,28,"#564362");
    pix(g,33,66,2,13,"#76576e");
    const mask=new Uint8Array(72*88);
    for(let y=3;y<68;y++){
      for(let x=3;x<69;x++){
        let inside=false;
        const wobble=(r()-.5)*.19;
        for(const [cx,cy,rx,ry] of lobes){
          const dx=(x-cx)/rx,dy=(y-cy)/ry;
          if(dx*dx+dy*dy<1+wobble){inside=true;break;}
        }
        mask[y*72+x]=inside?1:0;
      }
    }
    for(let y=4;y<68;y++){
      for(let x=3;x<69;x++){
        if(!mask[y*72+x])continue;
        const edge=!mask[(y-2)*72+x]||!mask[(y+2)*72+x]||!mask[y*72+x-2]||!mask[y*72+x+2];
        const v=r();
        let col;
        if(edge || (y>50&&v<.72))col=PAL.deep;
        else if(y>44&&v<.28)col=PAL.violet;
        else if(v<.12)col=PAL.deep;
        else if(v<.22)col=PAL.violet;
        else if(v>.89 && y<49)col=PAL.leafBright;
        else if(v>.57)col=PAL.leafHi;
        else col=PAL.leaf;
        pix(g,x,y,1,1,col);
      }
    }
    // Short dark jagged lines convey clumps and interlocking leaves, not blobs.
    for(let i=0;i<112;i++){
      const x=7+Math.floor(r()*58),y=9+Math.floor(r()*48);
      if(!mask[y*72+x])continue;
      const len=2+Math.floor(r()*7);
      const shade=r()>.86?"#61969a":r()>.36?"#3b315a":"#504063";
      for(let k=0;k<len;k++){
        const xx=x+k,yy=y+Math.floor(Math.sin(k*.9+i)*1.5);
        if(xx<69&&mask[clamp(yy,0,87)*72+xx])pix(g,xx,yy,1,1,shade);
      }
      if(r()>.47)pix(g,x+len-2,y+2,2,1,shade);
    }
    for(let i=0;i<9;i++){
      const x=14+Math.floor(r()*44),y=10+Math.floor(r()*44);
      if(mask[y*72+x])pix(g,x,y,1+r()*1.3|0,2,r()>.6?"#b7c4b0":"#6ca5a1");
    }
    return c;
  }
  function buildTreeSprites(){for(let i=0;i<9;i++)crownSprites.push(makeCrown(i));}

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

  function spawnFlock(cx,cy,n,id){
    for(let i=0;i<n;i++){
      const a=i*2.39996,d=4+Math.sqrt(i)*6;
      const x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;
      sheep.push({x,y,vx:0,vy:0,group:id,dir:"right",phase:rbetween(0,TAU),
        wander:rbetween(0,TAU),clock:rbetween(.1,2),panic:0,spot:i%4===0,
        home:false,hop:0,rest:rbetween(.1,2)});
    }
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
      const min=radius+5,d2=dx*dx+dy*dy;
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
      if(d<89){
        const power=1-d/100;
        s.vx+=(dx/Math.max(1,d))*power*31;
        s.vy+=(dy/Math.max(1,d))*power*31;
        s.panic=Math.max(s.panic,1.1+power);
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
    if(strength>.04){
      const speed=player.speed*strength;
      player.x+=dx*speed*dt;player.y+=dy*speed*dt;
      player.angle=Math.atan2(dy,dx);
      if(Math.abs(dx)>Math.abs(dy)*.85)player.face=dx>0?"right":"left";
      else player.face=dy>0?"down":"up";
      player.step+=dt*10*strength;
      if(Math.random()<dt*3*strength)addParticles(player.x,player.y,"#bec08d",1);
    }
    collideTrees(player,4);
  }

  function updateSheep(dt) {
    for(let i=0;i<sheep.length;i++){
      const s=sheep[i];
      s.phase+=dt*(s.home?1:2);
      if(s.home){
        s.vx*=Math.exp(-dt*2);s.vy*=Math.exp(-dt*2);
        s.x+=s.vx*dt;s.y+=s.vy*dt;
        const d=distance(s,HOME);
        if(d>27){
          s.x=lerp(s.x,HOME.x+(s.x-HOME.x)/d*23,dt*2);
          s.y=lerp(s.y,HOME.y+(s.y-HOME.y)/d*23,dt*2);
        }
        continue;
      }
      s.clock-=dt;
      if(s.clock<=0){s.clock=rand(.8,2.6);s.wander+=rand(-1.8,1.8);}
      s.panic=Math.max(0,s.panic-dt);
      const panic=s.panic>0;
      let ax=Math.cos(s.wander)*2.1,ay=Math.sin(s.wander)*2.1;
      let n=0,groupX=0,groupY=0,alignX=0,alignY=0;
      for(let j=0;j<sheep.length;j++){
        if(i===j)continue;
        const o=sheep[j],ox=o.x-s.x,oy=o.y-s.y,d2=ox*ox+oy*oy;
        if(d2<110 && d2>.001){
          const f=(11-Math.sqrt(d2))*.7;
          ax-=ox*f;ay-=oy*f;
        }
        if(o.group!==s.group||o.home||d2>70*70)continue;
        n++;groupX+=o.x;groupY+=o.y;alignX+=o.vx;alignY+=o.vy;
      }
      if(n){
        const pull=panic?.025:.09;
        ax+=(groupX/n-s.x)*pull;ay+=(groupY/n-s.y)*pull;
        ax+=(alignX/n-s.vx)*.14;ay+=(alignY/n-s.vy)*.14;
      }
      const ddx=s.x-player.x,ddy=s.y-player.y,dogDist=Math.hypot(ddx,ddy);
      if(dogDist<25){
        const p=(25-dogDist)/25;
        ax+=(ddx/Math.max(1,dogDist))*p*35;
        ay+=(ddy/Math.max(1,dogDist))*p*35;
      }
      if(panic){ax+=s.vx*.25;ay+=s.vy*.25;}
      const friction=Math.exp(-dt*(panic?1.35:2.4));
      s.vx=(s.vx+ax*dt)*friction;
      s.vy=(s.vy+ay*dt)*friction;
      const max=panic?32:8,sp=Math.hypot(s.vx,s.vy);
      if(sp>max){s.vx=s.vx/sp*max;s.vy=s.vy/sp*max;}
      s.x+=s.vx*dt;s.y+=s.vy*dt;
      collideTrees(s,2.4);
      if(sp>2){
        if(Math.abs(s.vx)>Math.abs(s.vy)*.75)s.dir=s.vx>0?"right":"left";
        else s.dir=s.vy>0?"down":"up";
      }
      // Inside the circle, sheep settle down and stay safe.
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
      g.beginPath();g.ellipse(player.x,player.y-6,r,r*.65,0,0,TAU);g.stroke();
    }
    g.globalAlpha=1;
  }

  function drawTree(g,t){
    const sprite=crownSprites[t.sprite];
    // The y-offset includes an entire visible trunk, giving a lowered-camera illusion.
    const sway=Math.sin(time*.65+t.sway)>0.93?1:0;
    g.drawImage(sprite,Math.round(t.x-35)+sway,Math.round(t.y-79));
  }
  function drawPlayer(g){
    const fr=(Math.floor(player.step)%2);
    g.drawImage(dogSprites[player.face+fr],Math.round(player.x-10),Math.round(player.y-16));
    if(time-barkTime<.15){
      pix(g,player.x+10,player.y-15,2,2,"#f1e4cd");
      pix(g,player.x+15,player.y-19,3,2,"#f1e4cd");
    }
  }
  function drawSheep(g,s){
    const fr=Math.floor(s.phase*1.8)%2;
    const key=s.dir+fr+(s.spot?1:0);
    g.drawImage(sheepSprites[key],Math.round(s.x-9),Math.round(s.y-14));
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
      if(t.x<cx-75||t.x>cx+screenW+75||t.y<cy-8||t.y>cy+screenH+95)continue;
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
    actors.push({y:player.y,kind:2,object:player});
    actors.sort((a,b)=>a.y-b.y);
    for(const a of actors){
      if(a.kind===0)drawTree(ctx,a.object);
      else if(a.kind===1)drawSheep(ctx,a.object);
      else if(a.kind===2)drawPlayer(ctx);
      else drawShrine(ctx,a.object);
    }
    drawMoths(ctx);drawBark(ctx);drawParticles(ctx);
    ctx.restore();
  }

  function frame(timestamp){
    if(!last)last=timestamp;
    const dt=Math.min(.05,(timestamp-last)/1000);last=timestamp;time+=dt;
    updatePlayer(dt);updateSheep(dt);updateParticles(dt);
    const ease=1-Math.exp(-dt*4.5);
    camX=clamp(lerp(camX,player.x-screenW/2,ease),0,Math.max(0,W-screenW));
    camY=clamp(lerp(camY,player.y-screenH/2,ease),0,Math.max(0,H-screenH));
    drawWorld();
    requestAnimationFrame(frame);
  }

  function setupInput(){
    game.addEventListener("pointerdown",e=>{
      if(e.target.closest("#action"))return;
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
    action.addEventListener("pointerdown",e=>e.stopPropagation());
    action.addEventListener("click",e=>{e.stopPropagation();doAction();});
    action.addEventListener("contextmenu",e=>e.preventDefault());
    document.addEventListener("contextmenu",e=>e.preventDefault());
  }

  function init(){
    resize();
    buildTreeSprites();buildSheepSprites();buildDogSprites();
    generateTrees();makeGround();spawnLife();
    setupInput();
    window.addEventListener("resize",resize);
    window.addEventListener("orientationchange",resize);
    document.addEventListener("visibilitychange",()=>{last=0;currentInput=null;});
    requestAnimationFrame(frame);
  }
  init();
})();