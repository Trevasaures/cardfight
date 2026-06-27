SET_CODE_NAMES = {
    # Add/update these over time.
    # Standard sets
    "D-BT01": "Genesis of the Five Greats",
    "D-BT02": "A Brush with the Legends",
    "D-BT03": "Advance of Intertwined Stars",
    "D-BT04": "Awakening of Chakrabarthi",
    "D-BT05": "Triumphant Return of the Brave Heroes",
    "D-BT06": "Blazing Dragon Reborn",
    "D-BT07": "Raging Flames Against Emerald Storm",
    "D-BT08": "Minerva Rising",
    "D-BT09": "Dragontree Invasion",
    "D-BT10": "Dragon Masquerade",
    "D-BT11": "Clash of the Heroes",
    "D-BT12": "Evenfall Onslaught",
    "D-BT13": "Flight of Chakrabarthi",

    # Standard sets (DZ)
    "DZ-BT01": "Fated Clash",
    "DZ-BT02": "Illusionless Strife",
    "DZ-BT03": "Dimensional Transcendence",
    "DZ-BT04": "Destined Showdown",
    "DZ-BT05": "Omniscient Awakening",
    "DZ-BT06": "Generation Dragenesis",
    "DZ-BT07": "Moon Fangs & Cerulean Blaze",
    "DZ-BT08": "Knights of Rebirth",
    "DZ-BT09": "Super Brave Detonation",
    "DZ-BT10": "Dragonsoul Resonance",
    "DZ-BT11": "Symphony of Might & Bloom",
    "DZ-BT12": "Chasm of Lost Souls",
    "DZ-BT13": "Parallactic Clash",
    "DZ-BT14": "Envoys of the Crimson Moon",
    "DZ-BT15": "Strike of Illusionary Shadows",
    "DZ-BT16": "Paralactic Dawn",
}


def lookup_set_name(set_code: str | None) -> str | None:
    if not set_code:
        return None

    return SET_CODE_NAMES.get(str(set_code).strip().upper())