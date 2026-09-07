"""Package the checked-in offline demo without dependencies or local user data."""
from hashlib import sha256
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]


def main():
    html = (ROOT / "打开此间.html").read_bytes()
    guide = (ROOT / "docs/download-guide.txt").read_bytes()
    if b'<!doctype html>' not in html[:100].lower() or b'<div id="root">' not in html:
        raise ValueError("Offline HTML is missing or invalid; rebuild it first.")
    output = ROOT / ".releases"
    output.mkdir(exist_ok=True)
    standalone = output / "index.html"
    standalone.write_bytes(html)
    archive = output / "cijian-demo.zip"
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, data in [("index.html", html), ("README.txt", guide)]:
            info = ZipInfo("cijian-demo/" + name, date_time=(2026, 9, 7, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            info.create_system = 3
            bundle.writestr(info, data)
    with ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        assert bundle.read("cijian-demo/index.html") == html
    lines = [f"{sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in [archive, standalone]]
    (output / "SHA256SUMS.txt").write_text("".join(lines), encoding="utf-8")
    for name in ["cijian-demo.zip", "index.html", "SHA256SUMS.txt"]:
        p = output / name
        print(f"{p.name}: {p.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
