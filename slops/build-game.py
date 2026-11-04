"""Build the browser-only game UI; retain the original full-quality scene assets."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parent.parent
SRC=ROOT/'slops/kerai-race';OUT=ROOT/'dist/slops/kerai-race'
(OUT/'assets').mkdir(parents=True,exist_ok=True)
def asset(name,content):
 if isinstance(content,str):content=content.encode()
 p=Path(name);target=f'assets/{p.stem}.{hashlib.sha256(content).hexdigest()[:16]}{p.suffix}'
 (OUT/target).write_bytes(content);return target
manifest=json.loads((SRC/'assets.json').read_text())
manifest['game']=asset('game.js',(SRC/'game.js').read_text())
manifest['ui']=asset('ui.js',(SRC/'ui.js').read_text())
css=asset('ui.css',(SRC/'ui.css').read_text())
version=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()[:16]
loader=asset('loader.js',(SRC/'loader.js').read_text().replace('BUILD_VERSION',version))
(OUT/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
(OUT/'index.html').write_text((SRC/'template.html').read_text().replace('UI_STYLESHEET',css).replace('GAME_LOADER',loader))
print('Built speedometer and phone controls; no backend.')
