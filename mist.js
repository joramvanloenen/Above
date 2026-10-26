/* ABOVE — low-cost, world-space drifting mist particles.
   Draws reusable soft cloud sprites directly on the pixel-art canvas.
   No fluid grid, WebGL, raymarching, or full-screen fog composite. */
(() => {
  "use strict";

  class AboveMist {
    constructor(document, biomeAt) {
      this.biomeAt = biomeAt;
      this.particles = [];
      this.sprites = Object.create(null);
      this.room = undefined;
      this.width = 0;
      this.height = 0;
      this.camX = 0;
      this.camY = 0;
      this.time = 0;
      this.actorHistory = new WeakMap();
      this.seed = 0;
      const colors = {
        meadow:[229,232,213],forest:[189,215,203],
        mire:[194,213,191],highlands:[221,215,201],
        twilight:[210,193,224],crypt:[187,208,221]
      };
      // Each fog particle is drawn from a tiny, precomputed soft cloud.
      // Building these once avoids gradients, blur filters and new canvases per frame.
      for(const [type,rgb] of Object.entries(colors)){
        this.sprites[type]=[];
        for(let variant=0;variant<4;variant++){
          const canvas=document.createElement("canvas");
          canvas.width=128;canvas.height=72;
          const g=canvas.getContext("2d");
          const blobs=6+variant;
          for(let k=0;k<blobs;k++){
            const phase=(k*2.399963+variant*1.63);
            const cx=64+Math.cos(phase)*((k%3)*11+7);
            const cy=36+Math.sin(phase*1.13)*((k%3)*5+3);
            const rx=22+(k*13+variant*7)%20;
            const ry=12+(k*7+variant*4)%11;
            g.save();g.translate(cx,cy);g.scale(rx/ry,1);
            const gradient=g.createRadialGradient(0,0,0,0,0,ry);
            gradient.addColorStop(0,"rgba("+rgb.join(",")+",0.15)");
            gradient.addColorStop(.34,"rgba("+rgb.join(",")+",0.12)");
            gradient.addColorStop(.72,"rgba("+rgb.join(",")+",0.043)");
            gradient.addColorStop(1,"rgba("+rgb.join(",")+",0)");
            g.fillStyle=gradient;g.fillRect(-ry,-ry,ry*2,ry*2);
            g.restore();
          }
          this.sprites[type].push(canvas);
        }
      }
    }

    targetCount() {
      const area=this.width*this.height;
      return Math.max(46,Math.min(116,Math.round(area/340)));
    }

    reset(width,height,camX,camY,room){
      this.width=width;this.height=height;
      this.camX=camX;this.camY=camY;
      this.room=room;
      this.particles.length=0;
      this.actorHistory=new WeakMap();
      const target=this.targetCount();
      for(let i=0;i<target;i++){
        const p={x:0,y:0,vx:0,vy:0,size:0,speed:0,layer:0,phase:0,
          sway:0,variant:i%4,life:0};
        this.respawn(p,true);
        this.particles.push(p);
      }
    }

    respawn(p,initial=false){
      // Larger overdraw ensures the view stays populated while scrolling.
      const margin=75;
      p.x=this.camX-margin+Math.random()*(this.width+margin*2);
      p.y=this.camY-margin+Math.random()*(this.height+margin*2);
      p.vx=-1.5+Math.random()*3;
      p.vy=-.6+Math.random()*1.2;
      p.speed=.75+Math.random()*.8;
      p.size=52+Math.random()*69;
      p.layer=Math.random();
      p.phase=Math.random()*Math.PI*2;
      p.sway=.3+Math.random()*.7;
      p.life=initial?Math.random():0;
    }

    update(dt,camX,camY,room,width,height,scene) {
      this.time+=dt;
      if(this.room!==room || this.width!==width || this.height!==height){
        this.reset(width,height,camX,camY,room);
      }
      this.camX=camX;this.camY=camY;
      const target=this.targetCount();
      while(this.particles.length<target){
        const p={x:0,y:0,vx:0,vy:0,size:0,speed:0,layer:0,phase:0,
          sway:0,variant:this.particles.length%4,life:0};
        this.respawn(p,true);this.particles.push(p);
      }
      if(this.particles.length>target)this.particles.length=target;

      // Store movement of nearby entities once, not once per particle.
      const nearby=[];
      const pushActor=(actor,radius,strength)=>{
        if(!actor||actor.dead)return;
        if(actor.x<this.camX-130||actor.x>this.camX+width+130||
           actor.y<this.camY-130||actor.y>this.camY+height+130)return;
        const old=this.actorHistory.get(actor);
        const dx=old?actor.x-old.x:0,dy=old?actor.y-old.y:0;
        // Teleports and entering crypts are not physical motion.
        const vx=Math.hypot(dx,dy)>90?0:dx/Math.max(dt,.01);
        const vy=Math.hypot(dx,dy)>90?0:dy/Math.max(dt,.01);
        this.actorHistory.set(actor,{x:actor.x,y:actor.y});
        nearby.push({x:actor.x,y:actor.y,vx,vy,radius,strength});
      };
      pushActor(scene.player,25,1.8);
      pushActor(scene.dog,21,1.15);
      if(room===null){
        for(const s of scene.sheep)pushActor(s,16,.55);
        for(const e of scene.enemies)if(e.room===null)pushActor(e,20,e.type==="golem"?1.6:1.0);
        if(!scene.boss.dead)pushActor(scene.boss,41,2.4);
      } else {
        for(const e of scene.enemies)if(e.room===room)pushActor(e,20,1.1);
      }

      const drag=Math.exp(-dt*1.75);
      for(const p of this.particles){
        p.phase+=dt*p.sway;
        // Slowly changing wind with different speeds between depth layers.
        const breezeX=(-2.1+Math.sin(p.y*.015+this.time*.33)*.95)*p.speed;
        const breezeY=(.25+Math.cos(p.x*.014-this.time*.29)*.65)*p.speed;
        p.vx=p.vx*drag+breezeX*(1-drag);
        p.vy=p.vy*drag+breezeY*(1-drag);

        for(const a of nearby){
          const dx=p.x-a.x,dy=p.y-a.y;
          const radius=a.radius+p.size*.23;
          const d2=dx*dx+dy*dy;
          if(d2>radius*radius)continue;
          const d=Math.sqrt(Math.max(1,d2));
          const falloff=(1-d/radius);
          // Radial parting plus trailing wake in direction of actor movement.
          p.vx+=(dx/d*23+a.vx*.28)*falloff*a.strength*dt;
          p.vy+=(dy/d*16+a.vy*.28)*falloff*a.strength*dt;
        }
        p.vx=Math.max(-33,Math.min(33,p.vx));
        p.vy=Math.max(-28,Math.min(28,p.vy));
        p.x+=(p.vx+Math.sin(p.phase)*.8)*dt;
        p.y+=(p.vy+Math.cos(p.phase*.8)*.45)*dt;
        if(p.x<this.camX-140||p.x>this.camX+width+140||
           p.y<this.camY-110||p.y>this.camY+height+110){
          // Recycle to an incoming edge, not the middle of the screen.
          this.respawn(p,false);
          if(Math.random()<.65)p.x=this.camX+width+65+Math.random()*55;
          else p.y=this.camY+(Math.random()<.5?-70:height+70);
        }
      }
    }

    draw(g,front=false){
      if(!this.particles.length)return;
      g.save();
      // Match the unfiltered pixel-art world; never bilinearly scale fog sprites.
      g.imageSmoothingEnabled=false;
      for(const p of this.particles){
        if((p.layer>.43)!==front)continue;
        const kind=this.room!==null?"crypt":this.biomeAt(p.x,p.y);
        const sprite=this.sprites[kind]||this.sprites.meadow;
        const regionStrength=kind==="mire"?1.35:kind==="twilight"?1.18
          :kind==="forest"?1.00:kind==="crypt"?1.15
          :kind==="highlands"?.73:.58;
        const pulse=.82+Math.sin(p.phase*.8)*.12;
        g.globalAlpha=Math.min(.86,regionStrength*(front?.53:.83)*pulse);
        const w=p.size*(front?1.07:1);
        const h=w*(front?.41:.37);
        if(p.x+w/2<this.camX-8||p.x-w/2>this.camX+this.width+8||
           p.y+h/2<this.camY-8||p.y-h/2>this.camY+this.height+8)continue;
        g.drawImage(sprite[p.variant],p.x-w/2,p.y-h/2,w,h);
      }
      g.restore();
    }
  }
  window.AboveMist=AboveMist;
})();