/* Above GPU height-volume fog.
   Existing low-res fluid provides dynamic density and actor wakes.
   WebGL raymarches illuminated 3D fog; Canvas fallback remains. */
(() => {
  "use strict";
  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos,0.,1.);
    }`;
  const FRAG = "\nprecision highp float;\nvarying vec2 vUv;\nuniform sampler2D uScene,uDensity,uHeight;\nuniform vec2 uCamera,uView,uGridOrigin,uGridSize;\nuniform float uCell,uTime,uCrypt;\nfloat hash31(vec3 p) {\n  p=fract(p*.1031);p+=dot(p,p.yzx+33.33);\n  return fract((p.x+p.y)*p.z);\n}\nfloat noise3(vec3 p) {\n  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);\n  float a=hash31(i),b=hash31(i+vec3(1.,0.,0.));\n  float c=hash31(i+vec3(0.,1.,0.)),d=hash31(i+vec3(1.,1.,0.));\n  float e=hash31(i+vec3(0.,0.,1.)),g=hash31(i+vec3(1.,0.,1.));\n  float h=hash31(i+vec3(0.,1.,1.)),j=hash31(i+vec3(1.,1.,1.));\n  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),\n             mix(mix(e,g,f.x),mix(h,j,f.x),f.y),f.z);\n}\nvec3 linearize(vec3 v){return pow(max(v,vec3(0.)),vec3(2.2));}\nvec3 delinearize(vec3 v){return pow(max(v,vec3(0.)),vec3(1./2.2));}\nvoid main(){\n  vec3 original=linearize(texture2D(uScene,vUv).rgb);\n  float objectHeight=texture2D(uHeight,vUv).r*38.0;\n  vec2 ground=uCamera+vec2(vUv.x*uView.x,(1.-vUv.y)*uView.y);\n  vec3 scattering=vec3(0.);\n  float transmission=1.0;\n  const int STEPS=12;\n  const float HEIGHT=38.0;\n  const float DS=HEIGHT/float(STEPS);\n  // March from camera to object surface / ground. Visible tall objects\n  // interrupt the fog ray so their upper silhouette rises above the mist.\n  for(int i=0;i<STEPS;i++){\n    float z=HEIGHT-(float(i)+.5)*DS;\n    float visible=smoothstep(objectHeight-1.5,objectHeight+1.5,z);\n    vec2 world=ground+vec2(-z*.26,z*.62);\n    vec2 uv=(world/uCell-uGridOrigin+vec2(.5))/uGridSize;\n    float flow=texture2D(uDensity,vec2(clamp(uv.x,.001,.999),\n                                       1.-clamp(uv.y,.001,.999))).r;\n    vec3 q=vec3(world*.027+vec2(uTime*.050,-uTime*.023),\n                z*.070+uTime*.011);\n    float body=noise3(q*.82);\n    float detail=noise3(q*1.83+vec3(6.4,14.1,2.3));\n    float billow=smoothstep(.31,.63,body*.78+detail*.22);\n    float vertical=exp(-z*.074)*(1.-smoothstep(HEIGHT-8.,HEIGHT,z));\n    float extinction=flow*(.24+1.50*billow)*vertical*visible;\n    float upstream=noise3(q*.82+vec3(-.42,-.35,.55));\n    float sun=exp(-2.2*max(0.,upstream-.33));\n    float rim=clamp((body-upstream)*1.8+.45,0.,1.);\n    float light=clamp(.22+.57*sun+.24*rim,.18,.97);\n    vec3 ambient=uCrypt>.5?vec3(.19,.28,.36):vec3(.23,.34,.39);\n    vec3 daylight=uCrypt>.5?vec3(.56,.73,.79):vec3(.85,.83,.69);\n    vec3 source=mix(ambient,daylight,light);\n    float stepT=exp(-extinction*DS*.092);\n    scattering+=transmission*(1.-stepT)*source;\n    transmission*=stepT;\n  }\n  // Energy-conserving compositing: output = scene * transmittance + scattering.\n  gl_FragColor=vec4(delinearize(original*transmission+scattering),1.);\n}";

  class AboveVolumetricFog {
    constructor(document) {
      this.canvas=document.createElement("canvas");
      this.maskCanvas=document.createElement("canvas");
      this.maskCtx=this.maskCanvas.getContext("2d");
      this.ready=false;
      try {
        const gl=this.canvas.getContext("webgl",{
          alpha:false,antialias:false,
          depth:false,stencil:false,preserveDrawingBuffer:true,
          powerPreference:"low-power"
        })||this.canvas.getContext("experimental-webgl",{alpha:false,preserveDrawingBuffer:true});
        if(!gl)return;
        this.gl=gl;
        const compile=(type,code)=>{
          const shader=gl.createShader(type);
          gl.shaderSource(shader,code);
          gl.compileShader(shader);
          if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
          return shader;
        };
        const program=gl.createProgram();
        gl.attachShader(program,compile(gl.VERTEX_SHADER,VERT));
        gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAG));
        gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
        this.program=program;
        gl.useProgram(program);
        const attr=gl.getAttribLocation(program,"aPos");
        const vertexBuffer=gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        gl.enableVertexAttribArray(attr);
        gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
        this.uniforms={};
        for(const name of ["uScene","uDensity","uHeight","uCamera","uView","uGridOrigin","uGridSize","uCell","uTime","uCrypt"])
          this.uniforms[name]=gl.getUniformLocation(program,name);
        this.textures=[];
        for(let i=0;i<3;i++){
          const tex=gl.createTexture();
          this.textures.push(tex);
          gl.activeTexture(gl.TEXTURE0+i);
          gl.bindTexture(gl.TEXTURE_2D,tex);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        }
        gl.uniform1i(this.uniforms.uScene,0);
        gl.uniform1i(this.uniforms.uDensity,1);
        gl.uniform1i(this.uniforms.uHeight,2);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
        this.lastStep=-1;this.lastOx=NaN;this.lastOy=NaN;this.lastRoom="unset";
        this.cols=0;this.rows=0;this.field=null;
        this.ready=true;
        this.canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();this.ready=false;});
      }catch(err){this.error=String(err);this.ready=false;}
    }

    // Build a height proxy for visible silhouettes, used to stop the
    // atmospheric ray at a surface instead of fogging every sprite equally.
    buildHeightMask(fog,scene){
      const w=fog.viewW,h=fog.viewH,g=this.maskCtx;
      if(this.maskCanvas.width!==w||this.maskCanvas.height!==h){
        this.maskCanvas.width=w;this.maskCanvas.height=h;
      }
      g.fillStyle="#000";g.fillRect(0,0,w,h);
      const cx=Math.round(fog.camX),cy=Math.round(fog.camY);
      const ellipse=(px,py,rx,ry,ht)=>{
        const x=px-cx,y=py-cy;
        if(x+rx<0||y+ry<0||x-rx>w||y-ry>h)return;
        const shade=Math.round(255*Math.min(1,ht/38));
        g.fillStyle="rgb("+shade+","+shade+","+shade+")";
        g.beginPath();g.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);g.fill();
      };
      const rect=(px,py,rx,ry,ht)=>{
        const x=px-cx,y=py-cy;
        if(x+rx<0||y+ry<0||x-rx>w||y-ry>h)return;
        const shade=Math.round(255*Math.min(1,ht/38));
        g.fillStyle="rgb("+shade+","+shade+","+shade+")";
        g.fillRect(Math.round(x-rx),Math.round(y-ry),Math.max(1,rx*2),Math.max(1,ry*2));
      };
      if(fog.room===null){
        for(const t of scene.trees){
          const scale=t.size*.5;
          ellipse(t.x,t.y-35*scale,45*scale,39*scale,32);
          rect(t.x,t.y-8*scale,3*scale,14*scale,13);
        }
        for(const t of scene.tombs)rect(t.x,t.y-7,11,9,17);
        for(const o of scene.obstacles)if(!o.broken)
          ellipse(o.x,o.y-5,7,6,o.type==="dummy"?14:8);
        for(const r of scene.relics)rect(r.x,r.y-4,3,7,15);
        for(const sheep of scene.sheep)ellipse(sheep.x,sheep.y-5,5,5,9);
      }
      ellipse(scene.player.x,scene.player.y-7,6,8,18);
      ellipse(scene.dog.x,scene.dog.y-5,5,5,11);
      for(const e of scene.enemies){
        if(e.dead||e.room!==fog.room)continue;
        const sc=e.type==="golem"?1.5:1;
        ellipse(e.x,e.y-7*sc,6.5*sc,8*sc,e.type==="golem"?23:e.type==="ghost"?16:14);
      }
      if(fog.room===null&&scene.boss&&!scene.boss.dead)
        ellipse(scene.boss.x,scene.boss.y-13,20,17,30);
    }

    // Opaque postprocess. Render once AFTER terrain, actors and particles;
    // write scene radiance * Beer-Lambert T + directional in-scattering.
    composite(ctx,sourceCanvas,fog,scene){
      if(!this.ready)return false;
      const gl=this.gl;
      try{
        const w=fog.viewW|0,h=fog.viewH|0;
        if(w<1||h<1)return false;
        if(this.canvas.width!==w||this.canvas.height!==h){
          this.canvas.width=w;this.canvas.height=h;
        }
        this.buildHeightMask(fog,scene);
        gl.viewport(0,0,w,h);
        gl.useProgram(this.program);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sourceCanvas);
        if(this.cols!==fog.cols||this.rows!==fog.rows){
          this.cols=fog.cols;this.rows=fog.rows;
          this.field=new Uint8Array(this.cols*this.rows);
          this.lastStep=-1;
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D,this.textures[1]);
        if(this.lastStep!==fog.steps||this.lastOx!==fog.ox||
           this.lastOy!==fog.oy||this.lastRoom!==fog.room){
          for(let i=0;i<this.field.length;i++)
            this.field[i]=Math.round(Math.max(0,Math.min(1,fog.d[i]))*255);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,this.cols,this.rows,
            0,gl.LUMINANCE,gl.UNSIGNED_BYTE,this.field);
          this.lastStep=fog.steps;this.lastOx=fog.ox;
          this.lastOy=fog.oy;this.lastRoom=fog.room;
        }
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D,this.textures[2]);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.maskCanvas);
        const u=this.uniforms;
        gl.uniform2f(u.uCamera,Math.round(fog.camX),Math.round(fog.camY));
        gl.uniform2f(u.uView,w,h);
        gl.uniform2f(u.uGridOrigin,fog.ox,fog.oy);
        gl.uniform2f(u.uGridSize,fog.cols,fog.rows);
        gl.uniform1f(u.uCell,fog.cell);
        gl.uniform1f(u.uTime,fog.clock);
        gl.uniform1f(u.uCrypt,fog.room===null?0:1);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.clearColor(0,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        ctx.save();
        ctx.globalAlpha=1;
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(this.canvas,0,0,w,h);
        ctx.restore();
        return true;
      }catch(err){this.error=String(err);this.ready=false;return false;}
    }
  }
  window.AboveVolumetricFog=AboveVolumetricFog;
})();