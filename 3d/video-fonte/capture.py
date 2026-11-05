import os,sys
from playwright.sync_api import sync_playwright
a,b=int(sys.argv[1]),int(sys.argv[2]); FPS=30
with sync_playwright() as p:
    br=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    g=br.new_page(viewport={'width':1080,'height':1920})
    g.goto('http://127.0.0.1:8765/video.html'); g.wait_for_function('window.ready===true',timeout=30000)
    for f in range(a,b):
        g.evaluate(f'frame({f/FPS})'); g.screenshot(path=f'frames/{f:05d}.jpg',type='jpeg',quality=92)
    br.close()
print('done',a,b)
