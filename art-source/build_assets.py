import numpy as np, trimesh, math, pathlib
from skimage.measure import marching_cubes
from scipy.ndimage import gaussian_filter
from PIL import Image
P=pathlib.Path(__file__).resolve().parents[1]/'assets/art'; P.mkdir(exist_ok=True)
rng=np.random.default_rng(42)
# Mesh authoring: implicit organic surfaces and tapered sculpted profiles. All generated offline.
def mesh(v,f,c):
    m=trimesh.Trimesh(vertices=v,faces=f,process=False); m.visual.vertex_colors=np.column_stack((np.clip(c,0,255).astype('uint8'),np.full(len(v),255,dtype='uint8')));return m

def gridmesh(v,c,wrap=True):
    a,b=v.shape[:2]; f=[]
    for i in range(a-1):
        for j in range(b if wrap else b-1):
            k=(j+1)%b; f.extend([[i*b+j,(i+1)*b+j,(i+1)*b+k],[i*b+j,(i+1)*b+k,i*b+k]])
    m=mesh(v.reshape(-1,3),np.array(f),c.reshape(-1,3));m.fix_normals();return m

def pigment(v,base,tip,scale=1,amount=.13):
    x,y,z=v[...,0],v[...,1],v[...,2]; n=np.sin(x*33+np.sin(z*17))*np.cos(y*34-z*19)+.35*np.sin(x*93+y*71+z*59); t=np.clip(y/scale,0,1)[...,None]; return (np.array(base)*(1-t)+np.array(tip)*t)*(1+amount*n[...,None])

def rock(seed,na=24,nb=44):
    rr=np.random.default_rng(seed); a=np.linspace(0,np.pi,na); b=np.linspace(0,2*np.pi,nb,endpoint=False); A,B=np.meshgrid(a,b,indexing='ij'); f=1+.12*np.sin(3*B+seed)*np.sin(A)**2+.09*np.cos(5*B+2*A)+.045*np.sin(11*B+7*A); x=f*np.sin(A)*np.cos(B); z=f*np.sin(A)*np.sin(B); y=(np.cos(A)+1)*.40; y+=.045*np.sin(B*7+2*A)*np.sin(A)**2; v=np.stack((x,y,z),-1); t=np.clip(y/.8,0,1)[...,None]; base=np.array([39,80,90]); top=np.array([104,145,137]); c=base+(top-base)*t; bands=np.sin(y*34+np.sin(B*4)*1.9+np.sin(A*8))*8+np.sin(x*40+z*38)*4;c+=bands[...,None];return gridmesh(v,c)

def plate(seed):
    rr=np.random.default_rng(seed); pieces=[]
    for j,(R,Y,dx,dz) in enumerate([(0.55,.24,0,0),(.73,.43,.08,.02),(.55,.64,-.05,.05)]):
        # folded, scalloped cup, closed profile, sculpted both faces
        b=np.linspace(0,2*np.pi,64,endpoint=False); rad=np.array([.015,.11,.32,.57,.82,.98,1,.98,.82,.57,.32,.11,.015]); zprof=np.array([-.10,-.09,-.07,-.035,.015,.055,.09,.13,.095,.045,.015,.0,-.01]); Q,B=np.meshgrid(rad,b,indexing='ij'); H=np.broadcast_to(zprof[:,None],Q.shape); R2=Q*R*(1+.12*np.sin(5*B+seed+j)+.055*np.sin(9*B-j)); y=Y+H+.07*Q**1.6*np.sin(6*B+j)+.022*Q*np.cos(13*B); v=np.stack((dx+R2*np.cos(B),y,dz+R2*np.sin(B)),-1); col=pigment(v,[27,100,112],[111,203,187],.8,.09); col=col*(1-Q[...,None]*.18)+np.array([202,232,186])*Q[...,None]*.18;pieces.append(gridmesh(v,col))
    stem=trimesh.creation.cylinder(radius=.095,height=.58,sections=18);stem.apply_translation([0,0,0]);stem.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[1,0,0]));stem.apply_translation([0,.28,0]);stem.visual.vertex_colors=[60,119,112,255];pieces.append(stem);return trimesh.util.concatenate(pieces)

def implicit(points, radii, base, tip, step=.025, softness=.68):
    points=np.array(points); radii=np.array(radii); lo=np.min(points-radii[:,None]*1.55,axis=0); hi=np.max(points+radii[:,None]*1.55,axis=0); axes=[np.arange(lo[i],hi[i]+step,step) for i in range(3)]; field=np.zeros(tuple(map(len,axes)),np.float32)
    for p,r in zip(points,radii):
        slices=tuple(slice(max(0,np.searchsorted(a,p[i]-r*1.7)),min(len(a),np.searchsorted(a,p[i]+r*1.7)+1)) for i,a in enumerate(axes)); xx,yy,zz=np.ix_(*[a[s] for a,s in zip(axes,slices)]); dist=((xx-p[0])**2+(yy-p[1])**2+(zz-p[2])**2)/r**2;field[slices]+=np.exp(-dist*3.8)
    v,f,n,_=marching_cubes(field,level=softness,spacing=(step,)*3); v+=lo; m=mesh(v,f,pigment(v,base,tip,max(.4,v[:,1].max()),.09));m.fix_normals();return m

def branch(seed,base,tip):
    rr=np.random.default_rng(seed); pts=[];rs=[]
    def grow(p,d,length,r,depth):
        d=np.array(d)/np.linalg.norm(d); end=p+d*length; mid=(p+end)/2+rr.normal(0,.035,3); n=max(4,int(length/.023));
        for t in np.linspace(0,1,n):pts.append((1-t)**2*p+2*t*(1-t)*mid+t*t*end);rs.append(max(.043,r*(1-.31*t)))
        if depth:
            for j in range(2 if depth<3 else 3):
                a=rr.uniform(0,6.28); nd=d*.55+np.array([np.cos(a)*.75,.7,np.sin(a)*.75]);grow(end,nd,length*rr.uniform(.65,.86),r*.72,depth-1)
    for i in range(5):
        a=i*2.399; grow(np.array([.11*np.cos(a),.04,.11*np.sin(a)]),[.47*np.cos(a),1,.47*np.sin(a)],rr.uniform(.26,.44),.13,3)
    return implicit(pts,rs,base,tip,.021,.52)

def brain(seed,base,tip):
    rr=np.random.default_rng(seed); pts=[];rs=[]
    for i in range(56):
        a=i*2.39996; r=.43*np.sqrt(i/56); h=.14+.34*np.sqrt(max(0,1-(r/.46)**2));pts.append([np.cos(a)*r,h+rr.uniform(-.045,.045),np.sin(a)*r]);rs.append(rr.uniform(.12,.19))
    for i in range(12):
        a=i*2.39996; r=.32*np.sqrt(i/12);pts.append([np.cos(a)*r,.12,np.sin(a)*r]);rs.append(.22)
    return implicit(pts,rs,base,tip,.018,.44)

def vase(seed):
    rr=np.random.default_rng(seed); pieces=[]
    for i in range(7):
        a=i*2.39996; off=.26*np.sqrt(i/7); H=rr.uniform(.28,.69); R=rr.uniform(.075,.13); b=np.linspace(0,2*np.pi,32,endpoint=False); profile=np.array([[.34,0],[.66,.08],[.79,.35],[.84,.68],[1,.94],[1.12,1],[.95,1.035],[.72,.98],[.62,.88],[.56,.45],[.22,.18],[.015,.14]]); Q,B=np.meshgrid(np.arange(len(profile)),b,indexing='ij'); rad=profile[:,0,None]*R*(1+.08*np.sin(B*5+i)); y=profile[:,1,None]*H+np.zeros_like(B);v=np.stack((off*np.cos(a)+rad*np.cos(B)+y*.17*np.cos(a),y,off*np.sin(a)+rad*np.sin(B)+y*.17*np.sin(a)),-1);c=pigment(v,[61,52,131],[160,123,224],.7,.12); c[6:]*=.58; pieces.append(gridmesh(v,c))
    return trimesh.util.concatenate(pieces)

def ribbon(seed,base,tip,count=19,nt=13,nu=5):
    rr=np.random.default_rng(seed); parts=[]
    for i in range(count):
        a=i*2.39996; h=rr.uniform(.3,1.0); x0=rr.uniform(.02,.23)*np.cos(a);z0=rr.uniform(.02,.23)*np.sin(a);t=np.linspace(0,1,nt);u=np.linspace(-1,1,nu);T,U=np.meshgrid(t,u,indexing='ij');W=.05*np.sin(np.pi*T)**.66*(1+.21*np.sin(T*26+i));bend=h*.48*T*T; cx=x0+np.cos(a)*bend+.045*np.sin(T*8+i)*T;cz=z0+np.sin(a)*bend+.04*np.cos(T*8+i)*T;v=np.stack((cx+W*U*np.sin(a),h*T+.028*(1-U**2)*np.sin(T*np.pi),cz-W*U*np.cos(a)),-1);c=pigment(v,base,tip,1,.09);parts.append(gridmesh(v,c,False))
    return trimesh.util.concatenate(parts)

def anemone(seed):
    rr=np.random.default_rng(seed); parts=[]
    for i in range(38):
        a=i*2.39996; r=.28*np.sqrt(i/38); h=rr.uniform(.26,.53);t=np.linspace(0,1,17);b=np.linspace(0,2*np.pi,10,endpoint=False);T,B=np.meshgrid(t,b,indexing='ij');w=.027*(np.sin(np.pi*T)**.35+.25);w*=1+.7*np.exp(-((T-.88)/.13)**2);cx=r*np.cos(a)+.19*T*T*np.cos(a)+.035*np.sin(T*5+i)*T;cz=r*np.sin(a)+.19*T*T*np.sin(a);v=np.stack((cx+w*np.cos(B),h*T,cz+w*np.sin(B)),-1);c=pigment(v,[113,53,82],[255,168,156],.5,.06);parts.append(gridmesh(v,c))
    return trimesh.util.concatenate(parts)

def save(name,m):
    m.export(P/(name+'.glb'),include_normals=True);print(name,len(m.vertices),len(m.faces),flush=True)
for n,m in [('reef_rock',rock(3)),('reef_rock_b',rock(8)),('plate_coral',plate(3)),('staghorn_pink',branch(10,[114,58,107],[250,171,191])),('staghorn_gold',branch(9,[144,84,52],[255,203,142])),('brain_lilac',brain(10,[87,45,132],[206,154,238])),('brain_teal',brain(4,[16,92,100],[86,209,186])),('tube_sponge',vase(7)),('sea_grass',ribbon(4,[15,78,81],[72,181,144])),('anemone',anemone(1))]:save(n,m)
# seamless sand texture and relief normal from filtered multiscale noise
N=512; y,x=np.mgrid[0:N,0:N]; noise=rng.normal(size=(N,N));low=gaussian_filter(noise,8,mode='wrap');low/=low.std(); med=gaussian_filter(noise,1.8,mode='wrap');med/=med.std();wave=np.sin(2*np.pi*y/N*9+1.5*np.sin(x/N*2*np.pi*2)+.6*np.sin((x+y)/N*2*np.pi*4)); height=.16*wave+.06*low+.025*med+.012*noise; col=np.array([176,169,144])[None,None,:]+(wave*5+low*4+med*3+noise*2)[...,None]; Image.fromarray(np.clip(col,0,255).astype('uint8')).save(P/'sand.jpg',quality=93);dy,dx=np.gradient(height);normal=np.stack((-dx*3,-dy*3,np.ones_like(dx)),-1);normal/=np.linalg.norm(normal,axis=2,keepdims=True);Image.fromarray(((normal*.5+.5)*255).astype('uint8')).save(P/'sand-normal.png')

for name,seed in [('reef_rock',3),('reef_rock_b',8)]:save(name+'_low',rock(seed,12,24))
save('sea_grass_low',ribbon(4,[15,78,81],[72,181,144],count=14,nt=8,nu=3))
