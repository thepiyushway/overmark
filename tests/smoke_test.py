"""
End-to-end smoke test for Overmark's page in all three modes, against a mock of Claude's
desktop API: the web landing page, the Settings window, and the overlay (shortcuts, drawing,
spotlight, zoom capture loop, diagnostics).

    pip install playwright pillow && playwright install chromium
    python tests/smoke_test.py
"""
import asyncio, json
from playwright.async_api import async_playwright
import os, base64, io
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__))
APP='file://'+os.path.join(HERE,'..','index.html')
_im=Image.new('RGB',(96,96),'white'); ImageDraw.Draw(_im).text((10,40),'Week 47',fill='black'); _b=io.BytesIO(); _im.save(_b,'JPEG'); B64=base64.b64encode(_b.getvalue()).decode()
FAILS=[]
MOCK = r"""
window.__calls=[]; window.__sc={};
const SC=%s;
const ret={ 'window.getOptions':{options:{},applied:SC.applied}, 'permissions.state':SC.perms,
 'window.getBounds':{x:0,y:0,width:1400,height:900}, 'screen.getAllDisplays':[{id:1,label:'Main',bounds:{x:0,y:0,width:1400,height:900},workArea:{x:0,y:0,width:1400,height:900}}],
 'screen.getCursorScreenPoint':{x:500,y:400}, 'window.setOptions':{applied:'now',reloading:false,options:{}},
 'permissions.request':Object.assign({},SC.perms,{overlay:'granted',shortcuts:'granted','menu-bar':'granted','full-access':'granted'}),
 'os.tmpdir':'/tmp', 'childProcess.exec':{stdout:'',stderr:'',code:0,signal:null,truncated:false}, 'fs.readFile':'%s', 'install.state':'available'};
const rec=(n,fn)=>(...a)=>{ window.__calls.push(n+' '+JSON.stringify(a).slice(0,160)); if(fn) return fn(...a); return Promise.resolve(ret[n]); };
const D={}; const add=(m,fn)=>{const ps=m.split('.'); let o=D; for(let i=0;i<ps.length-1;i++){o[ps[i]]??={}; o=o[ps[i]];} o[ps.at(-1)]=rec(m,fn);};
['install.state','install.request','permissions.manage','window.setOptions','window.getOptions','window.place','window.show','window.hide','window.getBounds','window.setBounds','window.setIgnoreMouseEvents','window.setVisibleOnAllWorkspaces','app.dock.setIcon','screen.getCursorScreenPoint','screen.getAllDisplays','globalShortcut.unregisterAll','tray.set','os.tmpdir','childProcess.exec','fs.readFile'].forEach(m=>add(m));
add('permissions.state',(n)=>Promise.resolve(n?SC.perms[n]:SC.perms));
add('permissions.request',()=>{Object.assign(SC.perms,ret['permissions.request']);return Promise.resolve(ret['permissions.request']);});
add('globalShortcut.register',(acc,fn)=>{window.__sc[acc]=fn;return Promise.resolve(true);});
window.__db={}; const DBM={doc:(p)=>({set:async(v)=>{window.__db[p]=v;}})}; const UM={id:async()=>'u123'}; if(SC.browser){ window.claude={use:async(n)=>n==='db'?DBM:({install:D.install})}; } else window.claude={use:async(n)=>n==='db'?DBM:n==='user'?UM:D};
if(SC.ls) for(const [k,v] of Object.entries(SC.ls)) localStorage.setItem('overmark.'+k, JSON.stringify(v));
"""
async def page(b, scen, vp=(1280,900), scheme='light'):
    pg = await b.new_page(viewport={"width":vp[0],"height":vp[1]}, color_scheme=scheme)
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append('console.'+m.type+': '+m.text) if m.type in('error',) else None)
    if scen is not None: await pg.add_init_script(MOCK % (json.dumps(scen), B64))
    await pg.goto(APP); await pg.wait_for_timeout(1500)
    return pg, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1 landing (browser in artifact panel)
        for scheme in ['light','dark']:
            pg, errs = await page(b, {"browser":True,"applied":{},"perms":{}}, scheme=scheme)
            box = await pg.locator('#stage').bounding_box(); x0,y0=box['x']+300, box['y']+330
            await pg.keyboard.press('l'); await pg.keyboard.press('7')
            await pg.mouse.move(x0,y0); await pg.mouse.down(); await pg.keyboard.down('Shift'); await pg.mouse.move(x0+200,y0+30,steps=6); await pg.keyboard.up('Shift'); await pg.mouse.up()
            await pg.keyboard.press('h'); await pg.mouse.move(x0+420,y0-60); await pg.wait_for_timeout(200)
            
            await pg.keyboard.press('/'); await pg.wait_for_timeout(100); 
            await pg.keyboard.press('Escape'); await pg.keyboard.press('h'); await pg.keyboard.press('s'); await pg.mouse.move(x0+100,y0); await pg.wait_for_timeout(150)
            await pg.keyboard.press('b'); await pg.wait_for_timeout(150); 
            vis=await pg.is_visible('#install'); print('landing',scheme,'install visible:', vis, 'errors', errs); assert vis and not errs; await pg.close()
        pg, errs = await page(b, {"browser":True,"applied":{},"perms":{}}, vp=(390,844)); print('mobile errors',errs); assert not errs; await pg.close()
        # 2 settings window
        scen={"applied":{"titleBarStyle":"hiddenInset"},"perms":{"overlay":"prompt","shortcuts":"prompt","menu-bar":"prompt","full-access":"prompt"}}
        pg, errs = await page(b, scen, vp=(940,760))
        for t in ['general','annotate','cursor','spot','keys','about']:
            await pg.click(f'[data-tab={t}]'); await pg.wait_for_timeout(250)
            if t=='cursor':
                await pg.select_option('[data-cfg="hl.shape"]','squircle'); await pg.select_option('[data-cfg="hl.anim"]','pulse')
                await pg.hover('#pvCursor'); await pg.mouse.move(400,600)
            if t=='spot':
                await pg.click('[data-do=zoomperm]'); await pg.wait_for_timeout(300)
            if t=='keys':
                await pg.click('[data-rec=board]'); await pg.keyboard.press('Meta+Shift+KeyB'); await pg.wait_for_timeout(100)
            
        calls = await pg.evaluate('window.__calls'); 
        k2=await pg.evaluate("localStorage.getItem('overmark.keys2')"); print('settings errors', errs, '| keys2:', k2)
        assert not errs and '"board":"Command+Shift+B"' in k2, 'shortcut recorder failed'
        assert any('screencapture' in c for c in calls), 'zoom permission test capture not run'
        print(' zoom test exec:', [c for c in calls if 'exec' in c][:2])
        await pg.close()
        # 3 overlay
        scen={"applied":{"transparent":True,"frame":False},"perms":{"overlay":"granted","shortcuts":"granted","menu-bar":"granted","full-access":"granted"},"ls":{"cfg":{"tips":True}}}
        pg, errs = await page(b, scen, vp=(1400,900))
        sc = await pg.evaluate('Object.keys(window.__sc)'); print('overlay shortcuts', sc)
        assert len(sc) == 6, 'expected 6 global shortcuts'
        await pg.evaluate("window.__sc['Command+Shift+1']()"); await pg.wait_for_timeout(200)
        await pg.mouse.move(300,300); await pg.mouse.down(); await pg.mouse.move(600,420,steps=8); await pg.mouse.up()
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.evaluate("window.__sc['Command+Shift+8']()"); await pg.wait_for_timeout(600)
        
        await pg.evaluate("window.__sc['Command+Shift+8']()"); await pg.evaluate("window.__sc['Command+Shift+7']()"); await pg.mouse.move(700,450); await pg.wait_for_timeout(300)
        
        calls = await pg.evaluate('window.__calls')
        names=[c.split(' ')[0] for c in calls]
        assert not errs, errs
        assert names.count('childProcess.exec') > 5 and names.count('fs.readFile') > 5, 'zoom loop did not run'
        print('overlay errors', errs); print(' exec count', names.count('childProcess.exec'), 'readFile', names.count('fs.readFile'), 'tray.set', names.count('tray.set'))
        print(' exec sample', [c for c in calls if 'exec' in c][:1])
        print(" cls", await pg.evaluate("document.documentElement.className")); await pg.wait_for_timeout(1200); d=await pg.evaluate("window.__db"); evs=[e["ev"] for e in d.get("data/users/u123/diag",{}).get("events",[])]; print(" db events:", evs[:40])
        assert 'stroke' in evs and 'shortcut' in evs and 'enterOverlay' in evs, 'diagnostics missing key events'
        print('\nALL SMOKE TESTS PASSED')
        await pg.close(); await b.close()
asyncio.run(main())
