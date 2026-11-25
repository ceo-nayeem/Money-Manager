"""Regenerates the app icons (needs: pip install pillow).  Run:  python tools/make_icons.py"""
from PIL import Image, ImageDraw, ImageFilter
import math, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')   # → finvault/icons/
S=4  # supersample
def bezier(p0,p1,p2,p3,n=40):
    pts=[]
    for i in range(n+1):
        t=i/n; u=1-t
        pts.append((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0], u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]))
    return pts
def shield_pts():
    # unit shield, centre (0,0), width 2, height 2
    right=[(0,-1),(0.82,-0.66),(0.82,0.06)]
    r=bezier((0.82,0.06),(0.82,0.6),(0.38,0.86),(0,1.0))
    left=[(-x,y) for (x,y) in reversed(r)]
    pts=[(0,-1),(0.82,-0.66)]+r+left[1:]+[(-0.82,-0.66)]
    return pts
def make(size,maskable=False,rounded=True,full_bleed=False):
    W=size*S
    img=Image.new('RGBA',(W,W),(0,0,0,0))
    # background: deep emerald-black with a soft radial glow
    bg=Image.new('RGBA',(W,W),(9,11,14,255))
    glow=Image.new('RGBA',(W,W),(0,0,0,0)); gd=ImageDraw.Draw(glow)
    gd.ellipse((W*0.05,-W*0.25,W*0.95,W*0.65),fill=(190,246,63,64))
    glow=glow.filter(ImageFilter.GaussianBlur(W*0.12))
    bg=Image.alpha_composite(bg,glow)
    # faint guilloche rings
    rl=Image.new('RGBA',(W,W),(0,0,0,0)); rd=ImageDraw.Draw(rl)
    for k in range(6):
        r=W*(0.2+0.075*k)
        rd.ellipse((W/2-r,W/2-r,W/2+r,W/2+r),outline=(190,246,63,30),width=max(1,S))
    bg=Image.alpha_composite(bg,rl)
    if full_bleed or maskable:
        img=bg
    else:
        mask=Image.new('L',(W,W),0); ImageDraw.Draw(mask).rounded_rectangle((0,0,W-1,W-1),radius=int(W*0.225),fill=255)
        img.paste(bg,(0,0),mask)
    # shield
    scale=W*(0.30 if maskable else 0.355)
    cx,cy=W/2,W/2+W*0.005
    pts=[(cx+x*scale,cy+y*scale*1.04) for x,y in shield_pts()]
    # gradient fill via mask
    grad=Image.new('RGBA',(W,W))
    gp=grad.load()
    top,bot=(214,255,104),(138,204,28)
    y0=cy-scale*1.04; y1=cy+scale*1.04
    for y in range(W):
        t=min(1,max(0,(y-y0)/(y1-y0)))
        c=tuple(int(top[i]+(bot[i]-top[i])*t) for i in range(3))+(255,)
        for x in range(W): gp[x,y]=c
    sm=Image.new('L',(W,W),0); ImageDraw.Draw(sm).polygon(pts,fill=255)
    # soft shadow
    sh=Image.new('RGBA',(W,W),(0,0,0,0)); sd=ImageDraw.Draw(sh)
    sd.polygon([(x,y+W*0.012) for x,y in pts],fill=(0,0,0,120)); sh=sh.filter(ImageFilter.GaussianBlur(W*0.012))
    img=Image.alpha_composite(img,sh)
    img.paste(grad,(0,0),sm)
    # inner edge highlight
    hl=Image.new('RGBA',(W,W),(0,0,0,0)); ImageDraw.Draw(hl).line(pts+[pts[0]],fill=(255,244,214,150),width=max(2,int(W*0.005)))
    img=Image.alpha_composite(img,hl)
    d=ImageDraw.Draw(img)
    # check mark
    ck=[(cx-scale*0.36,cy+scale*0.02),(cx-scale*0.08,cy+scale*0.32),(cx+scale*0.40,cy-scale*0.30)]
    d.line(ck,fill=(10,12,15,255),width=int(scale*0.2),joint='curve')
    for p in (ck[0],ck[-1]):
        r=scale*0.1; d.ellipse((p[0]-r,p[1]-r,p[0]+r,p[1]+r),fill=(10,12,15,255))
    return img.resize((size,size),Image.LANCZOS)
make(192).save(os.path.join(OUT, 'icon-192.png'))
make(512).save(os.path.join(OUT, 'icon-512.png'))
make(512,maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
make(180,full_bleed=True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
make(32).save(os.path.join(OUT, 'favicon-32.png'))
print('icons ok')
