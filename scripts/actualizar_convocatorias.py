#!/usr/bin/env python3
"""Escanea fuentes oficiales y genera candidatos; nunca declara una plaza abierta sin verificar el plazo."""
import json
import re
import sys
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

OUT = Path("datos/convocatorias-candidatas.json")
HEADERS = {
    "User-Agent": "KiwimanDigitalLabs-Convocatorias/1.0 (consulta de fuentes oficiales)",
    "Accept": "application/xml",
}
KEYWORDS = re.compile(r"\b(inform[aá]tic|microinform[aá]tic|sistem|soporte t[eé]cnic|redes|t[eé]cnic[oa] auxiliar inform[aá]tic|administrador.{0,20}sistema|programador|desarrollador)\b", re.I)
PLACES = {
    "El Puerto de Santa María": ["el puerto de santa maría", "el puerto de santa maria"],
    "Rota": ["rota"],
    "Chipiona": ["chipiona"],
    "Sanlúcar de Barrameda": ["sanlúcar de barrameda", "sanlucar de barrameda"],
    "Jerez de la Frontera": ["jerez de la frontera", "jerez"],
    "San Fernando": ["san fernando"],
}
SOURCES = [
    ("BOE", "https://www.boe.es/datosabiertos/api/boe/sumario/{date}", "API oficial de sumarios del BOE"),
    ("BOJA", "https://www.juntadeandalucia.es/boja/distribucion/boja.xml", "RSS oficial del BOJA"),
]

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=35) as response:
        return response.read()

def local_name(tag):
    return tag.rsplit("}", 1)[-1].lower()

def text_of(node):
    return " ".join(x.strip() for x in node.itertext() if x and x.strip())

def extract_records(root, source):
    records = []
    # RSS/Atom: each item/entry is a record. BOE XML: collect likely document containers.
    nodes = [n for n in root.iter() if local_name(n.tag) in ("item", "entry", "documento", "disposicion", "resultado")]
    if not nodes:
        nodes = list(root)
    for node in nodes:
        title = ""
        link = ""
        for child in node.iter():
            tag = local_name(child.tag)
            value = (child.text or "").strip()
            if tag in ("title", "titulo", "titulodisposicion", "tituloanuncio") and value and not title:
                title = value
            if tag in ("link", "urlhtml", "url_html", "url") and value and not link:
                link = value
            if tag == "link" and child.attrib.get("href") and not link:
                link = child.attrib["href"]
        full = text_of(node)
        if not title:
            title = full[:240]
        if title and (KEYWORDS.search(title) or KEYWORDS.search(full)):
            records.append({"fuente": source, "titulo": title[:500], "url": link, "texto_indice": full[:1800]})
    return records

def classify_place(record):
    haystack = (record.get("titulo", "") + " " + record.get("texto_indice", "")).casefold()
    matches = []
    for place, aliases in PLACES.items():
        if any(alias in haystack for alias in aliases):
            matches.append(place)
    return matches

def main():
    now = datetime.now(timezone.utc)
    candidates, errors = [], []
    # Sumarios recientes: el diario oficial puede no publicarse en fines de semana/festivos.
    for offset in range(4):
        day = (now.date() - timedelta(days=offset)).strftime("%Y%m%d")
        url = f"https://www.boe.es/datosabiertos/api/boe/sumario/{day}"
        try:
            root = ET.fromstring(fetch(url))
            candidates.extend(extract_records(root, "BOE"))
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                errors.append(f"BOE {day}: HTTP {exc.code}")
        except Exception as exc:
            errors.append(f"BOE {day}: {type(exc).__name__}: {exc}")
    try:
        root = ET.fromstring(fetch(SOURCES[1][1]))
        candidates.extend(extract_records(root, "BOJA"))
    except Exception as exc:
        errors.append(f"BOJA RSS: {type(exc).__name__}: {exc}")

    unique = {}
    for item in candidates:
        key = (item["fuente"], item["titulo"].casefold(), item.get("url", ""))
        item["localidades_detectadas"] = classify_place(item)
        item["estado"] = "pendiente_verificar_plazo"
        item["plazas"] = None
        item["fecha_fin_solicitud"] = None
        unique[key] = item

    payload = {
        "ultima_consulta_utc": now.isoformat(timespec="seconds"),
        "estado_consulta": "parcial" if errors else "correcta",
        "nota": "Son coincidencias preliminares. No se consideran convocatorias abiertas ni se cuentan plazas hasta verificar bases, localidad y plazo en la fuente oficial.",
        "fuentes_consultadas": ["API oficial BOE (últimos 4 sumarios)", "RSS oficial BOJA"],
        "errores": errors,
        "candidatas": sorted(unique.values(), key=lambda x: (x["fuente"], x["titulo"].casefold())),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Guardadas {len(payload['candidatas'])} coincidencias preliminares; errores: {len(errors)}")
    # Fallar solo si ninguna fuente ha respondido, para no publicar un falso resultado vacío.
    if errors and len(errors) == len(SOURCES) + 3:
        sys.exit("Todas las fuentes han fallado; no se debe publicar un resultado vacío.")

if __name__ == "__main__":
    main()
