export const NATION_COLORS: Record<string, string> = {
  "Dragon Empire": "#e87872",
  "Dark States": "#b897ed",
  "Brandt Gate": "#8ac9e2",
  "Keter Sanctuary": "#e7c77e",
  "Stoicheia": "#81c29a",
  "Lyrical Monasterio": "#e19fc2",
};

export function nationColor(nation: string | null) {
  return NATION_COLORS[nation ?? ""] ?? "#dfb56d";
}
