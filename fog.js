/* ABOVE — low-resolution world-space ground-fog fluid.
   Screen-sized grid, ~15Hz fixed-rate semi-Lagrangian advection with
   3-iteration pressure projection, density relaxation and actor wakes.
   Rendered as two softly interpolated, translucent atmospheric layers.
   No WebGL, no per-frame canvas allocations, no external dependencies. */
(() => {
  "use strict";

  class GroundFog {
    constructor(document, biomeAt) {
      this.biomeAt = biomeAt;
      this.document = document;
      this.cell = 12;
      this.cols = 0;
      this.rows = 0;
      this.ox = 0;
      this.oy = 0;
      this.room = null;
      this.clock = 0;
      this.accumulator = 0;
      this.stepSeconds = 1 / 15;
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", {willReadFrequently: false});
      this.steps = 0;
      this.seed = 0;
    }

    configure(viewW, viewH, camX, camY, room) {
      // Capped grid density even for high-resolution landscape devices.
      const cell = Math.max(12, Math.ceil(Math.max(viewW / 62, viewH / 48)));
      const cols = Math.ceil(viewW / cell) + 8;
      const rows = Math.ceil(viewH / cell) + 8;
      if (this.cols !== cols || this.rows !== rows || this.cell !== cell || this.room !== room) {
        this.cell = cell;
        this.cols = cols;
        this.rows = rows;
        this.room = room;
        const n = cols * rows;
        this.d = new Float32Array(n);
        this.u = new Float32Array(n);
        this.v = new Float32Array(n);
        this.nd = new Float32Array(n);
        this.nu = new Float32Array(n);
        this.nv = new Float32Array(n);
        this.div = new Float32Array(n);
        this.p = new Float32Array(n);
        this.p2 = new Float32Array(n);
        this.canvas.width = cols;
        this.canvas.height = rows;
        this.image = this.ctx.createImageData(cols, rows);
        this.ox = Math.floor(camX / cell) - 4;
        this.oy = Math.floor(camY / cell) - 4;
          this.accumulator = 0;
        this.seed++;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const wx = (this.ox + x + .5) * cell, wy = (this.oy + y + .5) * cell;
          this.d[i] = this.base(wx, wy, room);
          this.u[i] = this.windX(wx, wy) * .6;
          this.v[i] = this.windY(wx, wy) * .6;
        }
        this.renderTexture();
      }
    }

    base(wx, wy, room) {
      let amount;
      if (room !== null) amount = .53;
      else {
        const type = this.biomeAt(wx, wy);
        amount = type === "mire" ? .91
          : type === "twilight" ? .78
          : type === "forest" ? .58
          : type === "highlands" ? .40 : .30;
      }
      // Long, low cloud banks. The wave repeats spatially, not per frame.
      const broad = Math.sin(wx * .0094 + wy * .0042) * .25
        + Math.cos(wy * .016 - wx * .0047) * .20
        + Math.sin((wx + wy) * .023 + .8) * .08;
      const river = .83 + .19 * Math.sin(wx * .0021 + wy * .0025);
      return Math.max(.015, Math.min(.97, amount * river * (.71 + broad)));
    }

    windX(wx, wy) {
      return .21 + .29 * Math.sin(wy * .016 + this.clock * .22)
        + .15 * Math.cos((wx + wy) * .012 - this.clock * .17);
    }

    windY(wx, wy) {
      return -.09 + .26 * Math.cos(wx * .014 - this.clock * .24)
        + .12 * Math.sin(wy * .023 + this.clock * .18);
    }

    // Keep the simulation anchored in world cells as the camera scrolls.
    // Existing fog fields are copied, not reset, so visible wakes persist.
    rebase(camX, camY) {
      const newOx = Math.floor(camX / this.cell) - 4;
      const newOy = Math.floor(camY / this.cell) - 4;
      const shiftX = newOx - this.ox, shiftY = newOy - this.oy;
      if (!shiftX && !shiftY) return;
      const w = this.cols, h = this.rows;
      if (Math.abs(shiftX) >= w || Math.abs(shiftY) >= h) {
        this.ox = newOx; this.oy = newOy;
        for (let y=0;y<h;y++) for(let x=0;x<w;x++){
          const i = y*w+x, wx=(newOx+x+.5)*this.cell, wy=(newOy+y+.5)*this.cell;
          this.d[i]=this.base(wx,wy,this.room);
          this.u[i]=this.windX(wx,wy);
          this.v[i]=this.windY(wx,wy);
        }
        return;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i=y*w+x, sx=x+shiftX, sy=y+shiftY;
        if(sx>=0 && sx<w && sy>=0 && sy<h){
          const from=sy*w+sx;
          this.nd[i]=this.d[from];
          this.nu[i]=this.u[from];
          this.nv[i]=this.v[from];
        } else {
          const wx=(newOx+x+.5)*this.cell, wy=(newOy+y+.5)*this.cell;
          this.nd[i]=this.base(wx,wy,this.room);
          this.nu[i]=this.windX(wx,wy);
          this.nv[i]=this.windY(wx,wy);
        }
      }
      [this.d,this.nd]=[this.nd,this.d];
      [this.u,this.nu]=[this.nu,this.u];
      [this.v,this.nv]=[this.nv,this.v];
      this.ox=newOx;this.oy=newOy;
    }

    // Inline bilinear sampler. Backtracing lets all fog structures drift with
    // the velocity field while remaining stable at low frame rates.
    sample(field, x, y) {
      const w=this.cols, h=this.rows;
      x=Math.max(0,Math.min(w-1.001,x));
      y=Math.max(0,Math.min(h-1.001,y));
      const ix=x|0,iy=y|0, tx=x-ix,ty=y-iy;
      const a=iy*w+ix;
      const b=(iy+1)*w+ix;
      const p=field[a]*(1-tx)+field[a+1]*tx;
      const q=field[b]*(1-tx)+field[b+1]*tx;
      return p+(q-p)*ty;
    }

    stirActor(a, strength, radius, room) {
      if (!a || a.dead || (Object.prototype.hasOwnProperty.call(a,"room") && a.room!==room)) return;
      // Motion history lives on existing game actors: zero temporary objects / step.
      const ddx=Number.isFinite(a._fogX)?a.x-a._fogX:0;
      const ddy=Number.isFinite(a._fogY)?a.y-a._fogY:0;
      a._fogX=a.x;a._fogY=a.y;
      const moved=Math.hypot(ddx,ddy);
      // Scene changes and teleporting are not motion; never inject huge impulses.
      const speed=moved>110?0:Math.min(2.7,moved/(this.stepSeconds*48));
      const cx=a.x/this.cell-this.ox, cy=a.y/this.cell-this.oy;
      if(cx<-radius-2||cy<-radius-2||cx>this.cols+radius||cy>this.rows+radius)return;
      const radius2=radius*radius;
      const minX=Math.max(1,Math.floor(cx-radius)),maxX=Math.min(this.cols-2,Math.ceil(cx+radius));
      const minY=Math.max(1,Math.floor(cy-radius)),maxY=Math.min(this.rows-2,Math.ceil(cy+radius));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const dx=x+.5-cx,dy=y+.5-cy;
        const r2=dx*dx+dy*dy;
        if(r2>radius2)continue;
        const influence=Math.pow(1-r2/radius2,2)*strength;
        const i=y*this.cols+x;
        // Soft obstacle clearing even at rest + strong displacement while moving.
        this.d[i]*=Math.max(.30,1-influence*(.07+speed*.20));
        if(speed>.02){
          const inv=1/Math.max(.6,Math.sqrt(r2));
          this.u[i]=Math.max(-4,Math.min(4,this.u[i]
            + influence*(dx*inv*speed*.95 + ddx/this.cell/this.stepSeconds*.42)));
          this.v[i]=Math.max(-4,Math.min(4,this.v[i]
            + influence*(dy*inv*speed*.95 + ddy/this.cell/this.stepSeconds*.42)));
        }
      }
    }

    stirActors(scene) {
      const room=this.room;
      this.stirActor(scene.player,1.25,2.4,room);
      this.stirActor(scene.dog,1.02,2.0,room);
      if(room!==null) {
        for(const e of scene.enemies)this.stirActor(e,e.type==="ghost"?.9:1.0,2,room);
      } else {
        for(const s of scene.sheep)this.stirActor(s,.65,1.55,room);
        for(const e of scene.enemies)this.stirActor(e,e.type==="golem"?1.7:.9,e.type==="golem"?2.8:1.85,room);
        if(scene.boss && !scene.boss.dead)this.stirActor(scene.boss,2.6,4.4,room);
      }
    }

    integrate(dt) {
      const w=this.cols,h=this.rows,d=this.d,u=this.u,v=this.v;
      const nd=this.nd,nu=this.nu,nv=this.nv;
      const room=this.room,cell=this.cell;
      const damping=Math.exp(-dt*1.65);
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x;
        const sx=x-u[i]*dt,sy=y-v[i]*dt;
        const wx=(this.ox+x+.5)*cell,wy=(this.oy+y+.5)*cell;
        const dd=this.sample(d,sx,sy);
        const neighbor=(d[i-1]+d[i+1]+d[i-w]+d[i+w])*.25;
        const wave=this.base(wx,wy,room);
        // Slow fog recharge and conservative numerical diffusion.
        nd[i]=Math.min(.99,Math.max(.008,dd*.975+neighbor*.015+wave*.010));
        nu[i]=this.sample(u,sx,sy)*damping
            +this.windX(wx,wy)*(1-damping);
        nv[i]=this.sample(v,sx,sy)*damping
            +this.windY(wx,wy)*(1-damping);
      }
      // Clean edges and avoid unrealistically building pressure at viewport borders.
      for(let x=0;x<w;x++){
        const top=x, bot=(h-1)*w+x;
        nd[top]=this.base((this.ox+x+.5)*cell,(this.oy+.5)*cell,room);
        nd[bot]=this.base((this.ox+x+.5)*cell,(this.oy+h-.5)*cell,room);
        nu[top]=nu[w+x];nu[bot]=nu[(h-2)*w+x];
        nv[top]=nv[w+x];nv[bot]=nv[(h-2)*w+x];
      }
      for(let y=0;y<h;y++){
        const left=y*w,right=y*w+w-1;
        nd[left]=this.base((this.ox+.5)*cell,(this.oy+y+.5)*cell,room);
        nd[right]=this.base((this.ox+w-.5)*cell,(this.oy+y+.5)*cell,room);
        nu[left]=nu[left+1];nu[right]=nu[right-1];
        nv[left]=nv[left+1];nv[right]=nv[right-1];
      }

      // A few Jacobi pressure iterations remove the worst velocity divergence.
      // Intentionally cheap: atmospheric fog doesn't need a full CFD solver.
      const div=this.div;
      this.p.fill(0);
      this.p2.fill(0);
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x;
        div[i]=-.5*(nu[i+1]-nu[i-1]+nv[i+w]-nv[i-w]);
      }
      let p=this.p,p2=this.p2;
      for(let iter=0;iter<3;iter++){
        for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
          const i=y*w+x;
          p2[i]=(div[i]+p[i-1]+p[i+1]+p[i-w]+p[i+w])*.25;
        }
        [p,p2]=[p2,p];
      }
      this.p=p;this.p2=p2;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x;
        nu[i]=Math.max(-4,Math.min(4,nu[i]-.5*(p[i+1]-p[i-1])));
        nv[i]=Math.max(-4,Math.min(4,nv[i]-.5*(p[i+w]-p[i-w])));
      }
      [this.d,this.nd]=[this.nd,this.d];
      [this.u,this.nu]=[this.nu,this.u];
      [this.v,this.nv]=[this.nv,this.v];
    }

    renderTexture() {
      if(!this.image)return;
      const data=this.image.data,w=this.cols,cell=this.cell;
      for(let i=0;i<this.d.length;i++){
        const x=i%w,y=(i/w)|0;
        const wx=(this.ox+x+.5)*cell,wy=(this.oy+y+.5)*cell;
        const region=this.room===null?this.biomeAt(wx,wy):"crypt";
        const d=this.d[i],o=i*4;
        // Height proxy: diffuse base + bright crests + darker recessed folds.
        const fold=Math.sin(wx*.018+wy*.010+this.clock*.24)
          *Math.cos(wy*.022-wx*.007-this.clock*.18);
        const shade=fold*18+6*(.5-d);
        let r=184,g=205,b=196;
        if(region==="mire"){r=181;g=202;b=183;}
        else if(region==="twilight"){r=198;g=188;b=212;}
        else if(region==="highlands"){r=215;g=208;b=195;}
        else if(region==="forest"){r=171;g=197;b=188;}
        else if(region==="crypt"){r=177;g=204;b=215;}
        data[o]=Math.max(0,Math.min(255,r+shade));
        data[o+1]=Math.max(0,Math.min(255,g+shade));
        data[o+2]=Math.max(0,Math.min(255,b+shade));
        data[o+3]=Math.min(180,Math.round(d*192));
      }
      this.ctx.putImageData(this.image,0,0);
    }

    update(dt,camX,camY,room,scene,viewW,viewH) {
      this.clock+=dt;
      this.configure(viewW,viewH,camX,camY,room);
      this.rebase(camX,camY);
      this.accumulator=Math.min(this.stepSeconds*2,this.accumulator+dt);
      if(this.accumulator<this.stepSeconds)return;
      const elapsed=this.stepSeconds;
      this.accumulator-=this.stepSeconds;
      this.stirActors(scene);
      this.integrate(elapsed);
      this.renderTexture();
      this.steps++;
    }

    // Passes draw over terrain, then a subtler raised layer in front of actors.
    // Smooth interpolation is explicitly enabled only for fog; pixel sprites
    // stay nearest-neighbor crisp and HUD remains clear.
    draw(ctx, foreground=false) {
      if(!this.cols)return;
      ctx.save();
      ctx.imageSmoothingEnabled=true;
      ctx.globalAlpha=foreground?.25:.84;
      const offset=foreground?-9:0;
      ctx.drawImage(this.canvas,
        this.ox*this.cell, this.oy*this.cell+offset,
        this.cols*this.cell, this.rows*this.cell);
      ctx.restore();
    }
  }

  window.AboveGroundFog=GroundFog;
})();