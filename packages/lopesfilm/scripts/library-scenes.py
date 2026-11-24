import numpy as np, sys, os, glob, hashlib
from PIL import Image, ImageFilter
W,H=960,540
def rng(seed): return np.random.default_rng(int(hashlib.md5(seed.encode()).hexdigest()[:8],16))
def hexc(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)],float)/255
def vgrad(stops):
    y=np.linspace(0,1,H)[:,None]; out=np.zeros((H,1,3))
    ps=[p for p,_ in stops]; cs=[hexc(c) for _,c in stops]
    for k in range(3): out[:,0,k]=np.interp(y[:,0],ps,[c[k] for c in cs])
    return np.repeat(out,W,1)
def noise(r,scale,amp=1):
    n=r.random((H//scale+2,W//scale+2)); im=Image.fromarray((n*255).astype('uint8')).resize((W,H),Image.BICUBIC).filter(ImageFilter.GaussianBlur(scale/3))
    a=np.asarray(im,float)/255; a=(a-a.min())/(a.max()-a.min()+1e-6); return a*amp
def ridge(r,base,amp,rough,seed_off=0):
    x=np.linspace(0,1,W); y=np.zeros(W)
    for o in range(5):
        f=2**o; y+=r.normal(0,1,1)[0]*0+np.interp(x*f*3,np.arange(f*3+2),r.random(f*3+2))*(amp/(1+o*rough))
    return base-y*H
def layer(img,col,line,fade=0.0,mist=None):
    ys=np.arange(H)[:,None]; mask=(ys>=line[None,:]).astype(float)
    m=mask[...,None]; c=hexc(col) if isinstance(col,str) else col
    if mist is not None:
        d=np.clip((ys-line[None,:])/(H*0.35),0,1)[...,None]; c=c*(1-d*fade)+mist*(d*fade)
    return img*(1-m)+c*m if np.ndim(c)==1 else img*(1-m)+c*m
def glow(img,cx,cy,rad,col,k=1.0):
    yy,xx=np.mgrid[0:H,0:W]; d=((xx-cx*W)**2+(yy-cy*H)**2)/(rad*W)**2
    return img+np.exp(-d)[...,None]*hexc(col)*k
def finish(img,r,grain=0.025,vig=0.35):
    yy,xx=np.mgrid[0:H,0:W]; v=1-vig*(((xx/W-.5)*1.6)**2+((yy/H-.5)*1.6)**2)
    img=img*v[...,None]+r.normal(0,grain,(H,W,1))
    img=np.clip(img,0,1)**0.95
    return Image.fromarray((img*255).astype('uint8'))
PAL=[('#0b1d3a','#2b4a7a','#e8a46a','#f6d9a8','#101826'),('#1a1033','#5a2d6e','#e8756a','#f7c58a','#150d22'),('#0a2a33','#1f6a73','#8fd0c0','#e9f2d0','#0a1d22'),
('#1b1b24','#3a3c52','#c9b79c','#efe6d2','#12121a'),('#2a1408','#8a3f1c','#f09a4a','#fbd9a0','#1a0c05'),('#08162b','#16417a','#58a6e8','#cfe9ff','#06101f'),
('#14211a','#2c5a41','#9ac28a','#eef2c8','#0d1712'),('#240a14','#6a1f3c','#e8706a','#ffd6b0','#16060d')]
def sky(p,glowx,glowy):
    s=vgrad([(0,p[0]),(0.55,p[1]),(0.85,p[2]),(1,p[3])]); return glow(s,glowx,glowy,0.28,p[3],0.55)
def mountains(r,p):
    img=sky(p,r.uniform(.25,.75),.6)
    for i,(base,amp) in enumerate([(0.62,.18),(0.72,.2),(0.82,.22),(0.92,.22)]):
        line=ridge(r,base*H,amp,1.3)
        t=i/3; col=hexc(p[1])*(1-t)*.6+hexc(p[4])*(0.4+t*.6)
        img=layer(img,col,line,0.6*(1-t),hexc(p[2]))
    return img
def sea(r,p):
    gx=r.uniform(.3,.7); img=sky(p,gx,.52); hz=int(H*.55)
    water=vgrad([(0,p[2]),(.2,p[1]),(1,p[4])])[hz:]; img[hz:]=water*.9+img[hz:]*0.1
    yy,xx=np.mgrid[hz:H,0:W]; refl=np.exp(-((xx-gx*W)/(W*.05*(1+(yy-hz)/60)))**2)*np.exp(-(yy-hz)/130)
    img[hz:]+=refl[...,None]*hexc(p[3])*.7
    ripple=noise(r,8,.03)[hz:]-.015; img[hz:]+=ripple[...,None]; return img
def city(r,p):
    img=sky(p,r.uniform(.3,.7),.7)
    for k,(b,h0,col) in enumerate([(.78,.3,1),(.88,.42,0)]):
        line=np.full(W,H*b); x=0
        while x<W:
            w=int(r.integers(30,90)); hh=H*b-r.uniform(.12,.5)*H*(0.5+h0)
            line[x:x+w]=np.minimum(line[x:x+w],hh); x+=w
        img=layer(img,hexc(p[4])*(0.7+0.3*k),line)
        if k==1:
            ys=np.arange(H)[:,None]; win=(noise(r,5,1)>0.78)&(ys>line[None,:]+6)&(((np.arange(W)[None,:]//9)%2)==0)&(((ys//12)%2)==0)
            img+=win[...,None]*hexc(p[3])*.8
    return img
def forest(r,p):
    img=sky(p,r.uniform(.3,.7),.55)
    img=glow(img,.5,.45,.5,p[3],.35)
    for i in range(5):
        base=H*(.55+i*.1); line=np.full(W,base)
        for _ in range(int(r.integers(14,26))):
            cx=int(r.integers(0,W)); wd=int(r.integers(30,70)); ht=r.uniform(.15,.35)*H
            xs=np.arange(W); tri=np.clip(1-np.abs(xs-cx)/wd,0,1)*ht; line=np.minimum(line,base-tri)
        t=i/4; img=layer(img,hexc(p[1])*(1-t)*.5+hexc(p[4])*(.5+t*.5),line,.55*(1-t),hexc(p[3]))
    return img
def dunes(r,p):
    img=sky(p,r.uniform(.3,.7),.5)
    for i in range(4):
        x=np.linspace(0,1,W); ph=r.uniform(0,6); line=H*(.6+i*.1)+np.sin(x*r.uniform(2,4)+ph)*H*.05+np.sin(x*9+ph)*H*.01
        t=i/3; img=layer(img,hexc(p[2])*(1-t)*.7+hexc(p[0])*(.2+t*.4),line,.3*(1-t),hexc(p[3]))
    return img
def mesh(r,p):
    img=vgrad([(0,p[0]),(1,p[4])])
    for _ in range(4): img=glow(img,r.uniform(0,1),r.uniform(0,1),r.uniform(.2,.45),p[int(r.integers(1,4))],r.uniform(.4,.8))
    return img
def aurora(r,p):
    img=vgrad([(0,'#050b18'),(1,'#0b1a2a')])
    for i in range(3):
        n=noise(r,90,1); x=np.linspace(0,1,W); yy=np.mgrid[0:H,0:W][0]
        c=(H*(.25+i*.08)+np.sin(x*3+i)*H*.12)[None,:]; band=np.exp(-((yy-c)/(H*.08))**2)*(.5+n)
        img+=band[...,None]*hexc(['#35e0a1','#4aa8ff','#a76bff'][i])*.45
    st=r.random((H,W))>0.9985; img+=st[...,None]*.9
    line=ridge(r,H*.85,.12,1.5); return layer(img,'#04070d',line)
def corridor(r,p):
    img=np.zeros((H,W,3)); yy,xx=np.mgrid[0:H,0:W]; cx,cy=W/2,H*.48
    d=np.maximum(np.abs(xx-cx)/(W/2),np.abs(yy-cy)/(H/2)); t=np.clip(d,0,1)
    base=hexc(p[1])*(1-t[...,None])+hexc(p[4])*t[...,None]
    stripes=((np.log(np.clip(d,0.02,2))*14)%1<.08)
    img=base+stripes[...,None]*hexc(p[3])*.22*(1-t[...,None]*.4)
    return glow(img,.5,.48,.12,p[3],.9)
def lake(r,p):
    img=mountains(r,p); hz=int(H*.62)
    refl=img[:hz][::-1][:H-hz]; refl=refl[:H-hz]
    n=noise(r,5,.05)[hz:hz+refl.shape[0]]
    img[hz:hz+refl.shape[0]]=refl*.55+hexc(p[1])*.2+n[...,None]-.025
    return img
def starry(r,p):
    img=vgrad([(0,p[4]),(.7,p[0]),(1,p[1])]); st=r.random((H,W)); img+=(st>0.9988)[...,None]*r.uniform(.5,1)
    img=glow(img,r.uniform(.2,.8),r.uniform(.2,.5),.5,p[2],.12)
    line=ridge(r,H*.84,.16,1.4); return layer(img,p[4],line)
def horizon(r,p):
    img=vgrad([(0,p[4]),(.5,p[0]),(.5,p[4]),(1,p[0])]); yy,xx=np.mgrid[0:H,0:W]; hz=H*.5
    gx=((xx-W/2)/np.maximum(yy-hz,1))*40; gy=1/np.maximum(yy-hz,1)*600
    g=(((gx%2)<.08)|((gy%2)<.1))&(yy>hz); img+=g[...,None]*hexc(p[2])*.35*np.clip((yy-hz)/(H*.5),0,1)[...,None]
    return glow(img,.5,.5,.25,p[3],.6)
KINDS=[mountains,sea,city,forest,dunes,mesh,aurora,corridor,lake,starry,horizon]
def make(name,seed=None):
    r=rng(name); k=KINDS[int(r.integers(0,len(KINDS)))]; p=PAL[int(r.integers(0,len(PAL)))]
    img=k(r,p); return finish(np.clip(img,0,1),r)
if __name__=='__main__':
    out=sys.argv[1]; names=sys.argv[2:]
    for n in names: make(n).save(os.path.join(out,os.path.basename(n)+'.jpg'),quality=88)
