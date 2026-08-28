"""Build the self-contained local dashboard from the source files."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
data = (ROOT / "data" / "marketing-data.json").read_text(encoding="utf-8")
styles = (ROOT / "styles.css").read_text(encoding="utf-8")
app = (ROOT / "app.js").read_text(encoding="utf-8")

html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Marketing Performance Dashboard</title>
  <script id="seed-data" type="application/json">{data}</script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <style>{styles}</style>
</head>
<body>
  <div id="app"></div>
  <script>{app}</script>
</body>
</html>
"""

(ROOT / "dashboard-standalone.html").write_text(html, encoding="utf-8")
print(f"Wrote {ROOT / 'dashboard-standalone.html'}")
