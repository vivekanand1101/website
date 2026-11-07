"""Build the small Slops index with the shared site theme."""
from pathlib import Path
from html import escape
import datetime,json
ROOT=Path(__file__).resolve().parent.parent
css=(ROOT/'shared/site.css').read_text()
# Keep projects.json in descending order, with the newest project first.
projects=json.loads((ROOT/'slops/projects.json').read_text())
def entry(project):
    slug=escape(project['slug'])
    title=escape(project['title'])
    description=escape(project['description'])
    if 'video' in project:
        video=escape(project['video'])
        return f'<article id="{slug}"><h2>{title}</h2><p>{description}</p><video controls playsinline preload="metadata" aria-label="{title} demo"><source src="{video}" type="video/mp4"><a href="{video}">Download {title} demo</a></video></article>'
    if 'audio' in project:
        audio=escape(project['audio'])
        return f'<article id="{slug}"><h2>{title}</h2><p>{description}</p><audio controls preload="none" aria-label="{title}"><source src="{audio}" type="audio/mpeg"><a href="{audio}">Download {title}</a></audio></article>'
    image=project.get('image',f"/slops/{project['slug']}.jpg")
    image_alt=escape(project.get('imageAlt',project['description']))
    width=int(project.get('imageWidth',720))
    height=int(project.get('imageHeight',405))
    preview=f'<a href="/slops/{slug}/" aria-label="Play {title}"><img src="{escape(image)}" width="{width}" height="{height}" loading="lazy" alt="{image_alt}"></a>' if image else ''
    return f'<article><h2><a href="/slops/{slug}/">{title}</a></h2><p>{description}</p>{preview}</article>'
entries=''.join(entry(project) for project in projects)
page=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slops · Vivek Anand</title><meta name="description" content="Small projects I build with AI, including games and voice agent experiments."><link rel="canonical" href="https://anandvivek.in/slops/"><link rel="icon" type="image/svg+xml" href="/favicon-editorial.svg"><style>{css}\nmain>h1{{font-size:30px;margin:0 0 12px}}main>p{{margin:0 0 32px;color:var(--muted)}}article+article{{margin-top:28px}}article{{border-top:1px solid var(--rule);padding-top:20px}}article h2{{font-size:22px;margin:0 0 8px}}article p{{margin:0 0 18px}}article video{{display:block;max-width:100%;height:auto}}article img{{display:block;width:100%;height:auto;border:1px solid var(--rule)}}</style></head><body><div class="wrap"><header class="site-header"><a class="site-title" href="/">Vivek Anand</a><nav aria-label="Main"><a href="/writing/">Writing</a><a href="/reading/">Reading</a><a href="/slops/" aria-current="page">Slops</a><a href="/">About</a></nav></header><main><h1>Slops</h1><p>Small projects I build with AI.</p>{entries}</main><footer class="site-footer">© {datetime.date.today().year} Vivek Anand · <a href="https://github.com/vivekanand1101">GitHub</a> · <a href="https://linkedin.com/in/vivekanandxyz">LinkedIn</a> · <a href="mailto:mail@anandvivek.in">Email</a></footer></div></body></html>'''
out=ROOT/'dist/slops';out.mkdir(parents=True,exist_ok=True);(out/'index.html').write_text(page)
