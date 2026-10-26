/* ABOVE — stylized directional blood and persistent ground decals.
   World-space ballistic sprays, gravity, tapered trails and pulsed bleeding.
   One small Canvas2D system; no external assets or filtering. */
(() => {
  "use strict";
  const TAU=Math.PI*2;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const PALETTE=["#6e182b","#842434","#a7343c","#bd4b4b","#4d1d30"];

  class AboveBlood {
    constructor(){
      this.air=[];
      this.marks=[];
      this.pools=[];
      this.emitters=[];
      this.maxAir=360;
      this.maxMarks=560;
      this.lastRoom=null;
      this.clock=0;
    }
    // Attack direction is the incoming weapon's travel vector, not a
    // random radial splash. Every impact is spatially tied to the victim.
    hit(victim,dirX,dirY,options={}){
      const room=options.room===undefined?null:options.room;
      let length=Math.hypot(dirX,dirY);
      if(length<.001){dirX=1;dirY=0;length=1;}
      dirX/=length;dirY/=length;
      const amount=options.amount??1;
      const fatal=!!options.fatal;
      const sourceHeight=options.sourceHeight??7;
      const x=victim.x, y=victim.y-2;
      // Player respawns immediately after a fatal hit: freeze the wound at
      // the original impact instead of dragging its emitter to camp.
      const source=options.fixedSource?{x:victim.x,y:victim.y}:victim;
      const shot={victim:source,x,y,dirX,dirY,room,
        sourceHeight,age:0,delay:0,remaining:fatal?2.5:1.05,
        volume:Math.min(2,amount),fatal};
      this.emitters.push(shot);
      // First directional spurt, with high-energy, long-traveling fine drops.
      this.burst(x,y,sourceHeight,dirX,dirY,room,fatal?20:9,amount);
      this.addPool(x,y+2,room,fatal?1.35:.6);
      if(this.emitters.length>45)this.emitters.splice(0,this.emitters.length-45);
    }
    burst(x,y,z,dx,dy,room,count,amount=1,thin=false){
      const sidewaysX=-dy,sidewaysY=dx;
      for(let i=0;i<count;i++){
        const spread=thin?.21:.49;
        const deviation=rand(-spread,spread);
        const vx=(dx+sidewaysX*deviation)*(thin?rand(23,49):rand(16,82))*Math.min(1.5,amount);
        const vy=(dy+sidewaysY*deviation)*(thin?rand(23,49):rand(16,82))*Math.min(1.5,amount);
        const velocityZ=thin?rand(21,38):rand(18,79);
        this.air.push({
          x,y,z:Math.max(2,z),vx,vy,vz:velocityZ,
          room,life:0,diameter:thin?rand(.45,1.1):rand(.65,2.4),
          color:PALETTE[(Math.random()*4)|0],oldX:x,oldY:y-z,
          thin
        });
      }
      if(this.air.length>this.maxAir)
        this.air.splice(0,this.air.length-this.maxAir);
    }
    addPool(x,y,room,initial=0.75){
      // Repeated impacts accumulate in the same puddle; don't allocate
      // thousands of overlapping growing ellipses at the feet of a victim.
      let closest=null,closestD=100;
      for(const pool of this.pools){
        if(pool.room!==room)continue;
        const dx=pool.x-x,dy=pool.y-y;
        const d=dx*dx+dy*dy;
        if(d<closestD){closest=pool;closestD=d;}
      }
      if(closest){
        closest.target=clamp(closest.target+initial*.50,2,15);
        closest.age=0;
      } else {
        this.pools.push({x,y,room,radius:.25,target:initial*2.1,age:0,
          seed:Math.random()*TAU,color:PALETTE[(Math.random()*3)|0]});
      }
      if(this.pools.length>125)this.pools.shift();
    }
    stain(x,y,dx,dy,room,size=1){
      const n=Math.hypot(dx,dy)||1;
      const ux=dx/n,uy=dy/n;
      this.marks.push({x,y,ux,uy,room,
        length:clamp(size*rand(1.2,2.9),.7,7),
        width:clamp(size*rand(.45,1.0),.45,2.5),
        color:PALETTE[(Math.random()*PALETTE.length)|0]});
      if(this.marks.length>this.maxMarks)this.marks.splice(0,this.marks.length-this.maxMarks);
    }
    update(dt) {
      this.clock+=dt;
      const gravity=235; // consistent parabolic arcs at all frame rates
      // Up to four substeps avoid tunneling through the floor on a long frame.
      const count=Math.max(1,Math.ceil(dt/.01667)),h=dt/count;
      for(let step=0;step<count;step++){
        for(let i=this.air.length-1;i>=0;i--){
          const p=this.air[i];
          p.oldX=p.x;p.oldY=p.y-p.z;
          p.x+=p.vx*h;
          p.y+=p.vy*h;
          p.z+=p.vz*h-gravity*.5*h*h;
          p.vz-=gravity*h;
          p.life+=h;
          if(p.z<=0||p.life>1.5){
            this.stain(p.x,p.y,p.vx,p.vy,p.room,p.diameter);
            // Bigger drops feed localized pools; small spray stays individual.
            if(p.diameter>1.05 || p.thin && Math.random()<.20)
              this.addPool(p.x,p.y,p.room,p.diameter*.20);
            this.air.splice(i,1);
          }
        }
      }
      for(let i=this.emitters.length-1;i>=0;i--){
        const e=this.emitters[i];
        e.age+=dt;e.remaining-=dt;e.delay-=dt;
        if(e.remaining<=0){this.emitters.splice(i,1);continue;}
        const duration=e.fatal?2.5:1.05;
        const pressure=clamp(e.remaining/duration,0,1);
        const pulses=e.fatal?0.115:0.17;
        if(e.delay<=0){
          e.delay+=pulses+rand(-.025,.025);
          // The emitter remains tied to the wound while the target moves.
          const x=e.victim.x+e.dirX*(e.fatal?1.5:1);
          const y=e.victim.y-2+e.dirY;
          const z=e.sourceHeight*(.35+.65*pressure);
          const dx=e.dirX+rand(-.10,.10);
          const dy=e.dirY+rand(-.10,.10);
          this.burst(x,y,z,dx,dy,e.room,
            pressure>.5?3:2,e.volume*(.55+.45*pressure),true);
          this.addPool(e.victim.x,e.victim.y+2,e.room,.09+.25*pressure);
        }
      }
      for(const pool of this.pools){
        pool.radius+=(pool.target-pool.radius)*(1-Math.exp(-dt*3.8));
        pool.age+=dt;
      }
    }
    drawGround(g,room,left,top,width,height){
      g.save();
      for(const mark of this.marks){
        if(mark.room!==room || mark.x<left-10||mark.x>left+width+10||
           mark.y<top-10||mark.y>top+height+10)continue;
        g.strokeStyle=mark.color;
        g.lineWidth=Math.max(.6,mark.width);
        g.beginPath();
        g.moveTo(Math.round(mark.x),Math.round(mark.y));
        g.lineTo(Math.round(mark.x+mark.ux*mark.length),
                 Math.round(mark.y+mark.uy*mark.length*.75));
        g.stroke();
      }
      for(const p of this.pools){
        if(p.room!==room || p.x<left-25||p.x>left+width+25||
           p.y<top-25||p.y>top+height+25)continue;
        const r=p.radius;
        const x=Math.round(p.x),y=Math.round(p.y);
        // Pools accumulate with irregular lobes, avoiding perfect circles.
        g.fillStyle="#491c2b";
        g.beginPath();g.ellipse(x,y,Math.max(.5,r*1.35),Math.max(.5,r*.60),p.seed*.1,0,TAU);g.fill();
        g.fillStyle=p.color;
        g.beginPath();g.ellipse(x-1,y,Math.max(.5,r*1.08),Math.max(.5,r*.42),-.08,0,TAU);g.fill();
        g.fillStyle="#a03940";
        g.fillRect(x-r*.27,y-r*.2,Math.max(.5,r*.32),Math.max(.5,r*.17));
      }
      g.restore();
    }
    drawAir(g,room,left,top,width,height){
      g.save();
      for(const p of this.air){
        if(p.room!==room || p.x<left-25||p.x>left+width+25||
          p.y-p.z<top-45||p.y-p.z>top+height+45)continue;
        const x=p.x,y=p.y-p.z;
        // Fine ribbon from previous to current location, which bends under
        // gravity in consecutive frames into a natural ballistic parabola.
        g.strokeStyle=p.color;
        g.lineWidth=p.thin?.7:Math.max(.8,p.diameter*.73);
        g.beginPath();g.moveTo(Math.round(p.oldX),Math.round(p.oldY));
        g.lineTo(Math.round(x),Math.round(y));g.stroke();
        g.fillStyle=p.color;
        g.fillRect(Math.round(x),Math.round(y),
          Math.max(1,p.diameter),Math.max(1,p.diameter*.68));
      }
      g.restore();
    }
  }
  window.AboveBlood=AboveBlood;
})();