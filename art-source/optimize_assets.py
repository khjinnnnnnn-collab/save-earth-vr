import pathlib,trimesh,numpy as np,vtk
from vtk.util.numpy_support import numpy_to_vtk,numpy_to_vtkIdTypeArray,vtk_to_numpy
from scipy.spatial import cKDTree
P=pathlib.Path(__file__).resolve().parents[1]/'assets/art'
limits={'reef_rock':(1900,650),'reef_rock_b':(1900,650),'plate_coral':(2800,850),'staghorn_pink':(5000,1700),'staghorn_gold':(5000,1700),'brain_lilac':(4600,1400),'brain_teal':(4600,1400),'tube_sponge':(2700,850),'sea_grass':(2000,650),'anemone':(4200,1200)}
for name,(hi,lo) in limits.items():
    if name in ['reef_rock','reef_rock_b','sea_grass']:continue
    m=trimesh.load(P/(name+'.glb'),force='mesh',process=False);v=np.array(m.vertices);f=np.array(m.faces);c=np.array(m.visual.vertex_colors);pd=vtk.vtkPolyData();pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(v,deep=True));pd.SetPoints(pts);cells=vtk.vtkCellArray();cells.SetData(numpy_to_vtkIdTypeArray(np.arange(0,len(f)*3+1,3,dtype=np.int64),deep=True),numpy_to_vtkIdTypeArray(f.astype(np.int64).ravel(),deep=True));pd.SetPolys(cells);tree=cKDTree(v)
    for target,suffix in [(hi,''),(lo,'_low')]:
        q=vtk.vtkQuadricDecimation();q.SetInputData(pd);q.SetTargetReduction(max(0,1-target/len(f)));q.VolumePreservationOn();q.Update();o=q.GetOutput();vv=vtk_to_numpy(o.GetPoints().GetData());ff=vtk_to_numpy(o.GetPolys().GetConnectivityArray()).reshape(-1,3);mm=trimesh.Trimesh(vertices=vv,faces=ff,process=False);_,ind=tree.query(vv);mm.visual.vertex_colors=c[ind];mm.export(P/(name+suffix+'.glb'),include_normals=True);print(name+suffix,len(ff),flush=True)
