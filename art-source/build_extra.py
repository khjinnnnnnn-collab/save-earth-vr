import numpy as np, trimesh as tr
from pathlib import Path
from scipy.interpolate import PchipInterpolator
P=Path(__file__).resolve().parents[1]/'assets/art'; rng=np.random.default_rng(43)
def mesh(v,f,c):
 m=tr.Trimesh(vertices=v.reshape(-1,3),faces=f,process=False);m.visual.vertex_colors=np.c_[np.clip(c.reshape(-1,3),0,255).astype('uint8'),np.full(len(m.vertices),255,dtype='uint8')];m.fix_normals();return m
def grid(v,c,wrap=True):
 n,k=v.shape[:2];faces=[]
 for i in range(n-1):
  for j in range(k if wrap else k-1):
   a=i*k+j;b=i*k+(j+1)%k;faces.extend([[a,a+k,b+k],[a,b+k,b]])
 return mesh(v,np.array(faces),c)
def paint(v,base,top,t,grain=5):
 x,y,z=np.moveaxis(v,-1,0); n=np.sin(x*34+z*47)*np.cos(y*52-z*22)+.45*np.sin(z*91+x*81);return np.array(base)+(np.array(top)-base)*np.clip(t,0,1)[...,None]+n[...,None]*grain
def spindle(profile,base,top,axis='z',n=48,k=40,detail=0,seed=1):
 p=np.array(profile);s=np.linspace(p[0,0],p[-1,0],n);a=np.linspace(0,2*np.pi,k,endpoint=False);S,A=np.meshgrid(s,a,indexing='ij'); rx=PchipInterpolator(p[:,0],p[:,1])(S);ry=PchipInterpolator(p[:,0],p[:,2])(S); off=PchipInterpolator(p[:,0],p[:,3])(S);f=1+detail*(np.sin(A*5+S*4+seed)+.45*np.cos(A*11-S*5)); X=rx*np.cos(A)*f;Y=off+ry*np.sin(A)*f;v=np.stack((X,Y,S),-1) if axis=='z' else np.stack((X,S,Y),-1); c=paint(v,base,top,.5+.5*np.sin(A) if axis=='z' else (S-s.min())/(s.max()-s.min()),3);return grid(v,c)
def ellipsoid(scale,base,top,detail=.025,n=36,k=48):
 u=np.linspace(0,np.pi,n);a=np.linspace(0,2*np.pi,k,endpoint=False);U,A=np.meshgrid(u,a,indexing='ij');f=1+detail*np.sin(A*5+U*4)*np.sin(U)**2;v=np.stack((scale[0]*np.sin(U)*np.cos(A)*f,scale[1]*np.cos(U),scale[2]*np.sin(U)*np.sin(A)*f),-1);return grid(v,paint(v,base,top,(np.cos(U)+1)/2,4))
def save(n,m):
 m.export(P/(n+'.glb'),include_normals=True);print(n,len(m.faces))
# Rock/island with continuous rounded beach, turf and erosion ridges.
a=np.linspace(0,2*np.pi,64,endpoint=False);p=np.array([[.001,-.30],[.65,-.25],[.98,-.12],[1,.02],[.92,.075],[.78,.12],[.67,.18],[.48,.34],[.30,.43],[.13,.48],[.001,.49]]);R,A=np.meshgrid(p[:,0],a,indexing='ij');Y=p[:,1,None]+np.zeros_like(A);f=1+.14*np.sin(A*3+.6)+.06*np.cos(A*7);v=np.stack((R*f*np.cos(A),Y+.04*R*np.sin(A*5),R*f*np.sin(A)),-1);t=np.clip((Y-.065)/.13,0,1);c=paint(v,[211,181,127],[64,130,86],t,5);save('tropical_islet',grid(v,c))
# Full frond geometry (not cutout texture), trunk bark and curved leaflets.
parts=[];t=np.linspace(0,1,34);a=np.linspace(0,2*np.pi,16,endpoint=False);T,A=np.meshgrid(t,a,indexing='ij');r=.12-.065*T+.012*np.sin(T*2*np.pi*24);v=np.stack((.55*T*T+r*np.cos(A),3.0*T,r*np.sin(A)), -1);parts.append(grid(v,paint(v,[105,77,47],[169,132,83],T,6)))
for i in range(10):
 a=i*2*np.pi/10+.12*np.sin(i);L=1.25+.45*np.sin(i*2.3)**2;d=np.array([np.cos(a),0,np.sin(a)]);per=np.array([-np.sin(a),0,np.cos(a)]);q=np.linspace(0,1,17);u=np.linspace(-1,1,5);Q,U=np.meshgrid(q,u,indexing='ij');center=np.array([.55,3,0])+Q[...,None]*L*d+(.45*np.sin(Q*np.pi)-.36*Q**2)[...,None]*np.array([0,1,0]);W=.12*np.sin(Q*np.pi)**.7;v=center+U[...,None]*W[...,None]*per;parts.append(grid(v,paint(v,[25,95,65],[103,173,69],Q,5),False))
 for j in range(1,12):
  q=j/13;center=np.array([.55,3,0])+q*L*d+np.array([0,.45*np.sin(q*np.pi)-.36*q*q,0]);
  for sign in [-1,1]:
   tt=np.linspace(0,1,8);uu=np.linspace(-1,1,3);T,U=np.meshgrid(tt,uu,indexing='ij');length=.38*np.sin(np.pi*q)**.65;v=center+T[...,None]*(per*sign*length+d*.20)+(-.13*T*T)[...,None]*np.array([0,1,0])+U[...,None]*.035*np.sin(np.pi*T)[...,None]*d;parts.append(grid(v,paint(v,[29,96,60],[112,185,80],T,4),False))
save('palm',tr.util.concatenate(parts))
# Smooth irregular ice, layered colored vertex data; base at zero.
for name,height,rad in [('iceberg',3.,2.),('ice_floe',.22,1.)]:
 p=np.array([[.002,0],[.68,0],[.96,.06],[1,.24],[.94,.58],[.72,.88],[.42,.98],[.002,1]]) if name=='iceberg' else np.array([[.002,0],[.84,0],[.97,.12],[1,.40],[.98,.75],[.87,.94],[.5,1],[.002,1]])
 R,A=np.meshgrid(p[:,0],np.linspace(0,2*np.pi,48,endpoint=False),indexing='ij');Y=p[:,1,None]+np.zeros_like(A);f=1+.13*np.sin(A*3+.5)+.085*np.cos(A*7+Y*3);v=np.stack((rad*R*f*np.cos(A)+.15*Y, height*(Y+.04*R*np.sin(5*A+Y)),rad*R*f*np.sin(A)),-1);c=paint(v,[83,163,193],[244,249,249],np.clip(Y*1.4,0,1),6);c+=np.sin(Y[...,None]*35+np.sin(A[...,None]*6))*4; m=grid(v,c);save(name,m)
# Whale, dolphin, fish body profiles, rounded instead of low-segment revolutions.
save('whale_body',spindle([[-1.9,.015,.02,0],[-1.7,.34,.29,.02],[-1.2,.61,.47,.03],[-.5,.79,.65,0],[.2,.75,.59,0],[.95,.52,.39,-.04],[1.65,.26,.23,-.04],[2.3,.085,.10,-.03]],[211,224,221],[48,94,139],detail=.025))
save('dolphin_body',spindle([[-.82,.01,.015,-.04],[-.7,.065,.035,-.06],[-.47,.14,.12,0],[-.14,.20,.19,.03],[.20,.17,.15,0],[.58,.10,.075,-.02],[.85,.04,.04,0]],[211,228,230],[74,125,159],detail=.01))
save('fish_body',spindle([[-.083,.002,.01,0],[-.06,.013,.025,0],[-.01,.034,.053,0],[.035,.031,.044,0],[.065,.013,.021,0],[.074,.002,.003,0]],[243,226,181],[219,159,94],n=26,k=20,detail=.015))
# Sculpted shell with scute borders and a subtle warm green-to-amber pattern.
u=np.linspace(0,np.pi/2,38);a=np.linspace(0,2*np.pi,72,endpoint=False);U,A=np.meshgrid(u,a,indexing='ij');r=.32; X=r*np.sin(U)*np.cos(A);Z=r*np.sin(U)*np.sin(A);Y=r*np.cos(U);v=np.stack((X,Y,Z),-1);sector=np.abs(np.sin(A*5));rings=np.abs(np.sin(U*6.4+.18*np.cos(A*5)));edge=np.exp(-np.minimum(sector*2.4,rings*2.8)**2*6);c=paint(v,[125,138,68],[83,126,88],np.cos(U),6);c=c*(1-edge[...,None]*.32);save('turtle_shell',grid(v,c))
save('turtle_head',ellipsoid([.13,.13,.13],[165,190,121],[92,150,109],.045))
save('seal_body',spindle([[-.47,.005,.008,0],[-.39,.12,.10,0],[-.22,.19,.17,0],[0,.22,.22,0],[.20,.18,.17,0],[.36,.10,.10,0],[.46,.005,.005,0]],[222,229,225],[113,143,159],axis='y',detail=.035))
save('seal_head',ellipsoid([.19,.19,.19],[218,231,229],[124,153,169],.02))
save('bear_body',ellipsoid([.2,.2,.2],[192,211,218],[248,244,231],.025))
save('bear_head',ellipsoid([.13,.13,.13],[205,221,224],[252,246,234],.02))
# Four complete school fish with sculpted fins and eyes, each single mesh.
for n,base,top in [('fish_amber',[241,215,156],[214,116,44]),('fish_blue',[172,223,220],[52,141,191]),('fish_rose',[242,211,209],[192,83,144]),('fish_gold',[247,225,155],[222,174,47])]:
 body=spindle([[-.083,.002,.01,0],[-.06,.013,.025,0],[-.01,.034,.053,0],[.035,.031,.044,0],[.065,.013,.021,0],[.074,.002,.003,0]],base,top,n=16,k=12,detail=.015)
 parts=[body]
 def shape(scale,pos,b,t):
  m=ellipsoid(scale,b,t,.01,5,7);m.apply_translation(pos);return m
 # slim forked tail and dorsal fin, overlapping at the root
 for sign in [-1,1]:
  m=shape([.009,.033,.042],[0,sign*.020,-.10],base,top);m.apply_transform(tr.transformations.rotation_matrix(sign*.50,[1,0,0],point=[0,0,-.08]));parts.append(m)
  m=shape([.009,.018,.036],[sign*.027,-.012,-.005],base,top);parts.append(m)
  for color,scale,pos in [([243,241,224],[.005,.013,.013],[sign*.027,.012,.035]),([26,38,43],[.006,.008,.008],[sign*.032,.012,.038])]:
   eye=tr.creation.icosphere(subdivisions=0);eye.apply_scale(scale);eye.apply_translation(pos);eye.visual.vertex_colors=color+[255];parts.append(eye)
 m=shape([.008,.022,.044],[0,.042,-.016],base,top);parts.append(m)
 # decimate fins and body together for schools, keep original vertex pigment via nearest neighbors.
 m=tr.util.concatenate(parts)
 # reduce mesh via VTK quadric decimation if available
 try:
  import vtk
  from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy
  from scipy.spatial import cKDTree
  pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(m.vertices,deep=True));cells=vtk.vtkCellArray();cells.SetCells(len(m.faces),numpy_to_vtkIdTypeArray(np.c_[np.full(len(m.faces),3),m.faces].astype('int64').ravel(),deep=True));pd=vtk.vtkPolyData();pd.SetPoints(pts);pd.SetPolys(cells);dec=vtk.vtkQuadricDecimation();dec.SetInputData(pd);dec.SetTargetReduction(max(0,1-850/len(m.faces)));dec.Update();out=dec.GetOutput();v=vtk_to_numpy(out.GetPoints().GetData());f=vtk_to_numpy(out.GetPolys().GetData()).reshape(-1,4)[:,1:];colors=m.visual.vertex_colors[cKDTree(m.vertices).query(v)[1],:3];m=mesh(v,f,colors)
 except Exception as e: print('decimation unavailable',e)
 save(n,m)

# Rounded planing hull, bow and stern based on the existing deck footprint.
t=np.linspace(0,2*np.pi,80,endpoint=False);h=np.linspace(0,1,15);H,T=np.meshgrid(h,t,indexing='ij');X=np.sin(T)*(.76*(.50+.50*H));Z=np.cos(T)*1.43-.25;X*=.93+.07*np.cos(T);X*=1-.38*np.maximum(0,-np.cos(T))**3;Y=-.53+.53*H+.035*np.maximum(0,-np.cos(T))**4;v=np.stack((X,Y,Z),-1);stripe=np.clip((H-.22)/.13,0,1);c=paint(v,[34,91,111],[231,235,223],stripe,4);accent=np.exp(-((H-.40)/.06)**4);c=c*(1-accent[...,None]) + np.array([45,132,151])*accent[...,None];save('boat_hull',grid(v,c))
