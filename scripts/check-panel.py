#!/usr/bin/env python3
"""Check that the weather indicator is in the real GNOME top bar, beside the clock."""

import json
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi


def walk(accessible, found):
    try:
        count = accessible.get_child_count()
    except Exception:
        return
    for index in range(count):
        child = accessible.get_child_at_index(index)
        if child is None:
            continue
        name = child.get_name() or ""
        role = child.get_role_name() or ""
        component = child.get_component()
        extents = None
        if component is not None:
            try:
                rect = component.get_extents(Atspi.CoordType.SCREEN)
                extents = {
                    "x": rect.x,
                    "y": rect.y,
                    "width": rect.width,
                    "height": rect.height,
                }
            except Exception:
                extents = None
        if extents and extents["y"] <= 160 and extents["height"] <= 120 and name:
            found.append({"name": name, "role": role, **extents})
        walk(child, found)


def main():
    Atspi.init()
    desktop = Atspi.get_desktop(0)
    found = []
    walk(desktop, found)
    weather = [
        item for item in found
        if item["y"] == 0 and item["height"] >= 24 and item["width"] >= 40
        and (item["name"].startswith("Météo") or item["name"].startswith("Weather,"))
    ]
    report = {"candidates": found, "weather": weather}
    target = sys.argv[1] if len(sys.argv) > 1 else None
    if target:
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))

    if len(weather) != 1:
        print(f"Indicateurs météo visibles : {len(weather)}", file=sys.stderr)
        return 2

    indicator = weather[0]
    others = [
        item for item in found
        if item is not indicator
        and item["y"] == 0
        and 24 <= item["height"] <= 48
        and item["width"] >= 40
        and item["x"] >= 0
    ]
    if not others:
        print("Aucun autre élément du panneau n'est aligné avec l'indicateur.", file=sys.stderr)
        return 3

    def gap(item):
        if item["x"] + item["width"] <= indicator["x"]:
            return indicator["x"] - (item["x"] + item["width"])
        if indicator["x"] + indicator["width"] <= item["x"]:
            return item["x"] - (indicator["x"] + indicator["width"])
        return 0

    nearest = min(others, key=gap)
    distance = gap(nearest)
    report["nearest"] = nearest
    report["gap"] = distance
    if target:
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
    print(
        f"Indicateur « {indicator['name']} » à x={indicator['x']}, "
        f"voisin « {nearest['name']} » à x={nearest['x']}, écart {distance}px"
    )
    if distance > 80:
        print("L'indicateur n'est pas assez proche de l'élément voisin du panneau.", file=sys.stderr)
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
