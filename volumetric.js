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
  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uDensity;
    uniform vec2 uCamera,uView,uGridOrigin,uGridSize;
    uniform float uCell,uTime,uCrypt;

    float hash31(vec3 p) {
      p = fract(p * .1031);
      p += dot(p,p.yzx+33.33);
      return fract((p.x+p.y)*p.z);
    }
    float noise3(vec3 p) {
      vec3 i=floor(p),f=fract(p);
      f=f*f*(3.-2.*f);
      float a=hash31(i);
      float b=hash31(i+vec3(1.,0.,0.));
      float c=hash31(i+vec3(0.,1.,0.));
      float d=hash31(i+vec3(1.,1.,0.));
      float e=hash31(i+vec3(0.,0.,1.));
      float f1=hash31(i+vec3(1.,0.,1.));
      float g=hash31(i+vec3(0.,1.,1.));
      float h=hash31(i+vec3(1.,1.,1.));
      return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),
                 mix(mix(e,f1,f.x),mix(g,h,f.x),f.y),f.z);
    }
    void main() {
      vec2 ground=uCamera+vec2(vUv.x*uView.x,(1.-vUv.y)*uView.y);
      float transparency=1.;
      vec3 scatter=vec3(0.);
      const int SLICES=9;
      const float HEIGHT=30.0;
      for(int i=0;i<SLICES;i++) {
        float z=(float(i)+.5)*(HEIGHT/float(SLICES));
        // Depth-parallax: each height samples a distinct 3D position.
        vec2 world=ground+vec2(-z*.24,z*.79);
        vec2 uv=(world/uCell-uGridOrigin)/uGridSize;
        float flow=texture2D(uDensity,clamp(uv,vec2(.001),vec2(.999))).r;
        vec3 q=vec3(world*.035+vec2(uTime*.045,-uTime*.023),z*.073+uTime*.012);
        float large=noise3(q*.72);
        float detail=noise3(q*1.87+vec3(8.1,13.8,2.4));
        float cloud=smoothstep(.27,.67,large*.71+detail*.29);
        // Density is strong at ground and tapers over 30 world units.
        float vertical=exp(-z*.067)*smoothstep(HEIGHT,HEIGHT-7.,z);
        float density=flow*(.10+cloud*1.8)*vertical;
        // Low-cost directional self-shadow from an upstream 3D sample.
        float shadowNoise=noise3(q*.72+vec3(-.32,-.33,.57));
        float sun=exp(-1.8*max(0.,shadowNoise-.34));
        float edge=clamp((large-shadowNoise)*1.8+.5,.05,1.);
        float light=clamp(sun*.67+edge*.44,.17,1.15);
        vec3 dark=uCrypt>.5?vec3(.24,.38,.43):vec3(.34,.49,.52);
        vec3 warm=uCrypt>.5?vec3(.67,.82,.83):vec3(1.00,.94,.78);
        vec3 color=mix(dark,warm,light);
        float absorption=1.-exp(-density*.27*(HEIGHT/float(SLICES)));
        float amount=transparency*absorption;
        scatter+=amount*color;
        transparency*=1.-absorption;
      }
      float opacity=clamp(1.-transparency,0.,.92);
      gl_FragColor=vec4(scatter/max(.0001,opacity),opacity);
    }`;

  class AboveVolumetricFog {
    constructor(document) {
      this.canvas=document.createElement("canvas");
      this.ready=false;
      try {
        const gl=this.canvas.getContext("webgl",{
          alpha:true,premultipliedAlpha:true,antialias:false,
          depth:false,stencil:false,preserveDrawingBuffer:true,
          powerPreference:"low-power"
        })||this.canvas.getContext("experimental-webgl",{alpha:true,preserveDrawingBuffer:true});
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
        for(const name of ["uDensity","uCamera","uView","uGridOrigin","uGridSize","uCell","uTime","uCrypt"])
          this.uniforms[name]=gl.getUniformLocation(program,name);
        this.texture=gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,this.texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.uniform1i(this.uniforms.uDensity,0);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
        this.lastStep=-1;
        this.lastOx=NaN;this.lastOy=NaN;this.lastRoom="unset";
        this.cols=0;this.rows=0;this.field=null;
        this.ready=true;
        this.canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();this.ready=false;});
      }catch(err){this.error=String(err);this.ready=false;}
    }

    draw(ctx,fog,foreground) {
      if(!this.ready)return false;
      const gl=this.gl;
      try {
        const width=fog.viewW,height=fog.viewH;
        if(!width||!height)return false;
        if(!foreground) {
          const w=Math.max(1,Math.ceil(width*.85));
          const h=Math.max(1,Math.ceil(height*.85));
          if(this.canvas.width!==w||this.canvas.height!==h){
            this.canvas.width=w;this.canvas.height=h;
          }
          gl.viewport(0,0,w,h);
          gl.useProgram(this.program);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D,this.texture);
          if(this.cols!==fog.cols||this.rows!==fog.rows){
            this.cols=fog.cols;this.rows=fog.rows;
            this.field=new Uint8Array(this.cols*this.rows);
            this.lastStep=-1;
          }
          if(this.lastStep!==fog.steps||this.lastOx!==fog.ox||
             this.lastOy!==fog.oy||this.lastRoom!==fog.room){
            for(let i=0;i<this.field.length;i++)
              this.field[i]=Math.max(0,Math.min(255,Math.round(fog.d[i]*255)));
            gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,this.cols,this.rows,
              0,gl.LUMINANCE,gl.UNSIGNED_BYTE,this.field);
            this.lastStep=fog.steps;this.lastOx=fog.ox;
            this.lastOy=fog.oy;this.lastRoom=fog.room;
          }
          const u=this.uniforms;
          gl.uniform2f(u.uCamera,fog.camX,fog.camY);
          gl.uniform2f(u.uView,width,height);
          gl.uniform2f(u.uGridOrigin,fog.ox,fog.oy);
          gl.uniform2f(u.uGridSize,fog.cols,fog.rows);
          gl.uniform1f(u.uCell,fog.cell);
          gl.uniform1f(u.uTime,fog.clock);
          gl.uniform1f(u.uCrypt,fog.room===null?0:1);
          gl.disable(gl.DEPTH_TEST);
          gl.disable(gl.BLEND);
          gl.clearColor(0,0,0,0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        }
        ctx.save();
        ctx.imageSmoothingEnabled=true;
        ctx.globalAlpha=foreground?.23:.95;
        ctx.drawImage(this.canvas,
          Math.round(fog.camX),Math.round(fog.camY)+(foreground?-6:0),width,height);
        ctx.restore();
        return true;
      } catch(err) {this.error=String(err);this.ready=false;return false;}
    }
  }
  window.AboveVolumetricFog=AboveVolumetricFog;
})();