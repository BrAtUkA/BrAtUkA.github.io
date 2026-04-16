from playwright.sync_api import sync_playwright

HTML = """
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    background: #0b0d10;
    font-family: 'Syne', Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  /* Subtle grid pattern */
  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
  }

  /* Red glow */
  .glow {
    position: absolute;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(220,20,60,0.12) 0%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .card {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #DC143C;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .eyebrow::before, .eyebrow::after {
    content: '';
    display: block;
    width: 32px;
    height: 1px;
    background: #DC143C;
  }

  h1 {
    color: #fff;
    font-size: 80px;
    font-weight: 800;
    text-align: center;
    line-height: 1.05;
    letter-spacing: -1px;
  }

  h1 .accent {
    background: linear-gradient(135deg, #DC143C 0%, #ff4d6d 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .desc {
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255,255,255,0.4);
    font-size: 20px;
    text-align: center;
    line-height: 1.6;
    max-width: 700px;
  }

  .tags {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }

  .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    letter-spacing: 0.05em;
    padding: 6px 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 4px;
    color: rgba(255,255,255,0.45);
  }

  .domain {
    position: absolute;
    bottom: 32px;
    right: 40px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    color: rgba(255,255,255,0.25);
    letter-spacing: 0.05em;
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="card">
    <div class="eyebrow">bratuka.dev</div>
    <h1>Turning theory<br>into <span class="accent">practice.</span></h1>
    <div class="desc">CS student, full-stack developer & reverse engineer.<br>Building things that are fast, private, and useful.</div>
    <div class="tags">
      <span class="tag">Python</span>
      <span class="tag">Flutter</span>
      <span class="tag">Rust / Tauri</span>
      <span class="tag">C# / .NET</span>
      <span class="tag">AI / ML</span>
    </div>
  </div>
  <span class="domain">github.com/BrAtUkA</span>
</body>
</html>
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 630})
    page.set_content(HTML)
    page.wait_for_load_state("networkidle")
    import os
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "imgs", "og-image.png")
    page.screenshot(path=out)
    browser.close()
    print("Saved imgs/og-image.png (1200x630)")
