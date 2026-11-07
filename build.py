import re,pathlib
s=pathlib.Path('src/template.html').read_text()
eng=pathlib.Path('src/engine.js').read_text()
prob=pathlib.Path('src/problems.js').read_text()
ui=pathlib.Path('src/ui.js').read_text()
s=s.replace('/*ENGINE*/',eng).replace('/*PROBLEMS*/',prob).replace('/*UI*/',ui)
pathlib.Path('index.html').write_text(s)
print(len(s))
